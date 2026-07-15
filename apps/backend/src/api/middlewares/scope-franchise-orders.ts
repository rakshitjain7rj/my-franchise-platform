/**
 * @file scope-franchise-orders.ts
 * @description Tenant-scoping middleware for Medusa's native `/admin/orders` routes.
 *
 * Security Model
 * ──────────────
 * Each franchise is linked to its sales channel(s) via the
 * `franchise-sales-channel` DML link — the single source of truth for the
 * franchise ⇄ channel association (the same canonical chain used by
 * `franchiseTenantMiddleware`; the legacy `franchise-store` chain is retired).
 * Every order in Medusa carries a `sales_channel_id`, so the access-control
 * chain is:
 *
 *   user  ──[franchise-user link]──▶  franchise_id(s)
 *   franchise_id  ──[franchise-sales-channel link]──▶  sales_channel_id(s)
 *   sales_channel_id  ──[Medusa Order model]──▶  orders
 *
 * For the list endpoint we mutate `req.filterableFields` to inject a
 * `sales_channel_id` allow-list derived from the user's franchise memberships.
 *
 * For the single-resource endpoint we perform a lightweight ownership check
 * BEFORE passing control to Medusa's handler, short-circuiting with 403 if
 * the order does not belong to any of the caller's allowed sales channels.
 */

import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  getSalesChannelIdsForFranchises,
  isSuperAdminUser,
  type AuthenticatedTenantRequest,
} from "../../utils/tenant-context"

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve every `sales_channel_id` the calling admin user is authorised to
 * access.
 *
 * Flow:
 *   1. `resolveAdminFranchiseIds` looks up the `franchise-user` link table
 *      and returns the set of franchise IDs bound to `req.auth_context.actor_id`.
 *      If it throws a NOT_ALLOWED error the user has no franchise link. We then
 *      verify `metadata.is_super_admin === true` ("positive flag" invariant —
 *      super-admin status is never inferred from the absence of franchise links).
 *      Only a confirmed super-admin receives unrestricted access (`null`);
 *      an unlinked, unflagged user fails closed (the error is re-thrown).
 *   2. Linked users are fanned out to the `franchise-sales-channel` link table
 *      (via `getSalesChannelIdsForFranchises`) to collect allowed channel IDs.
 *
 * Returns `null` if and only if the user is a confirmed Super Admin.
 */
async function resolveAllowedSalesChannelIds(
  req: AuthenticatedTenantRequest
): Promise<string[] | null> {
  // Step 1 — resolve the franchise IDs the authenticated user may access.
  let allowedFranchiseIds: string[]
  try {
    allowedFranchiseIds = await resolveAdminFranchiseIds(req)
  } catch (err: any) {
    if (err instanceof MedusaError && err.type === MedusaError.Types.NOT_ALLOWED) {
      // The user has no franchise link. Only bypass order scoping if they carry
      // the explicit super-admin flag — "no link" alone is NOT sufficient.
      const isSA = await isSuperAdminUser(req)
      if (isSA) return null
    }
    // Unflagged unlinked user, or any unexpected error — fail closed.
    throw err
  }

  // Step 2 — map those franchise IDs to their linked sales channel IDs via the
  // canonical `franchise-sales-channel` DML link table.
  return getSalesChannelIdsForFranchises(req, allowedFranchiseIds)
}

// ---------------------------------------------------------------------------
// Middleware #1 — Order Listing  (GET /admin/orders)
// ---------------------------------------------------------------------------

/**
 * `scopeFranchiseOrderList`
 *
 * Intercepts the list query and restricts results to orders whose
 * `sales_channel_id` falls within the set of channels owned by the
 * calling user's franchise(s).
 *
 * Medusa's list-orders handler reads from `req.filterableFields`, so mutating
 * that object is the idiomatic v2 approach (same pattern used for products in
 * this codebase).  This guarantees that even if the client sends a crafted
 * `sales_channel_id[]` query parameter, our allow-list takes precedence via
 * the intersection logic below.
 */
export const scopeFranchiseOrderList = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    // `req.auth_context` is populated by Medusa's authenticate() middleware
    // which runs before this handler (see middlewares.ts registration).
    const tenantReq = req as AuthenticatedTenantRequest

    const allowedSalesChannelIds = await resolveAllowedSalesChannelIds(tenantReq)

    if (allowedSalesChannelIds === null) {
      // Super Admin: no sales-channel restriction — pass through unfiltered.
      return next()
    }

    if (!allowedSalesChannelIds.length) {
      // The user belongs to a franchise that has no sales channel linked yet.
      // Return an empty result set rather than leaking all orders.
      res.status(200).json({ orders: [], count: 0, offset: 0, limit: 0 })
      return
    }

    // Determine the effective sales_channel_id filter:
    //  - If the client already sent a `sales_channel_id` filter (unlikely for
    //    most UI flows but possible for API consumers), take the intersection
    //    so that a restricted user can never bypass the allow-list by asking
    //    for a channel they do not own.
    //  - Otherwise, use the full allow-list.
    const existingFilter = (req.filterableFields as Record<string, unknown>)
      ?.sales_channel_id

    let effectiveSalesChannelIds: string[]

    if (existingFilter) {
      const clientRequested = Array.isArray(existingFilter)
        ? existingFilter
        : [existingFilter as string]

      // Intersection: keep only IDs the client asked for that are also allowed.
      effectiveSalesChannelIds = clientRequested.filter((id) =>
        allowedSalesChannelIds.includes(id)
      )

      if (!effectiveSalesChannelIds.length) {
        // The client requested a channel they are not allowed to see → empty set.
        res.status(200).json({ orders: [], count: 0, offset: 0, limit: 0 })
        return
      }
    } else {
      effectiveSalesChannelIds = allowedSalesChannelIds
    }

    // Mutate filterableFields — Medusa's query-validation middleware has
    // already populated this object by this point (we run after it).
    req.filterableFields = {
      ...(req.filterableFields ?? {}),
      // Medusa Order list supports `sales_channel_id` as a top-level filter.
      sales_channel_id: effectiveSalesChannelIds,
    }

    next()
  } catch (err: unknown) {
    // Surface MedusaErrors (e.g. NOT_ALLOWED / FORBIDDEN from tenant-context)
    // as well as unexpected runtime errors to Medusa's global error handler.
    next(err)
  }
}

// ---------------------------------------------------------------------------
// Middleware #2 — Single Order Guard  (GET /admin/orders/:id)
// ---------------------------------------------------------------------------

/**
 * `guardFranchiseOrderSingleResource`
 *
 * Performs an ownership pre-check before the request reaches Medusa's handler.
 *
 * We use the Remote Query API (`ContainerRegistrationKeys.QUERY`) to fetch only
 * the `sales_channel_id` of the requested order — a minimal, fast projection
 * that avoids loading the full order graph.  We then verify that the
 * `sales_channel_id` is in the caller's `allowedSalesChannelIds` set.
 *
 * If the check fails the request is short-circuited with a clean 403 response.
 * The handler never receives a cross-tenant request.
 */
export const guardFranchiseOrderSingleResource = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const tenantReq = req as AuthenticatedTenantRequest

    // Extract the target order ID from route params (e.g. /admin/orders/:id).
    const orderId = req.params?.id

    if (!orderId) {
      // Malformed route — let Medusa handle it with its own 404 / 400 logic.
      next()
      return
    }

    // ── Resolve the sales channels this user is allowed to access ───────────
    const allowedSalesChannelIds = await resolveAllowedSalesChannelIds(tenantReq)

    if (allowedSalesChannelIds === null) {
      // Super Admin: no franchise restriction — pass through.
      return next()
    }

    if (!allowedSalesChannelIds.length) {
      // User has a franchise membership but no sales channel is linked to it
      // yet. They can never own any order, so deny access.
      res.status(403).json({
        message:
          "Forbidden: no sales channels are linked to your franchise.",
        code: "FRANCHISE_NO_SALES_CHANNEL",
      })
      return
    }

    // ── Fetch the minimal order projection via Remote Query ──────────────────
    // We only need `sales_channel_id` to perform the ownership check.
    // Using `query.graph` (the DML-aware query engine) keeps us within the
    // Medusa v2 container pattern — no raw SQL or direct service calls needed.
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "sales_channel_id"],
      filters: { id: orderId },
    })

    if (!orders?.length) {
      // Order not found — let Medusa's own handler produce the 404.
      next()
      return
    }

    const order = orders[0] as { id: string; sales_channel_id?: string }

    // ── Ownership check ──────────────────────────────────────────────────────
    // An order is "owned" by a franchise if its sales_channel_id is one of the
    // channels bound to the caller's franchise via the canonical
    // `franchise-sales-channel` link.
    if (
      !order.sales_channel_id ||
      !allowedSalesChannelIds.includes(order.sales_channel_id)
    ) {
      // ❌ Order belongs to a different franchise — deny immediately.
      res.status(403).json({
        message:
          "Forbidden: you do not have permission to access this order.",
        code: "FRANCHISE_ORDER_ACCESS_DENIED",
      })
      return
    }

    // ✅ Ownership confirmed — hand off to Medusa's native order handler.
    next()
  } catch (err: unknown) {
    next(err)
  }
}
