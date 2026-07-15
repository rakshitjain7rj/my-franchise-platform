/**
 * @file scope-store-orders.ts
 * @description Tier-2 (store-level) scoping for /admin/orders, layered INSIDE
 *              the existing franchise scope (scope-franchise-orders.ts).
 *
 * Security Model
 * ──────────────
 * A branch manager may be bound to one or more StoreLocations via the
 * `store_location ←→ user` link. When bound, they must only see orders placed
 * at their branch(es):
 *
 *   user ──[store-location-user]──▶ store_location_id(s)
 *   store_location_id ──[store-location-order]──▶ order_id(s)
 *
 * These middlewares run AFTER `scopeFranchiseOrderList` /
 * `guardFranchiseOrderSingleResource`, so the franchise boundary is already
 * enforced. Here we ADD an order `id` allow-list (list) / ownership check
 * (single) derived from the manager's stores.
 *
 * Backward-compatibility: a user with NO store-location link resolves to `null`
 * and is passed through untouched — they remain franchise-wide, exactly as
 * before this feature existed. Store scoping is strictly opt-in per user.
 */

import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  resolveAllowedStoreLocationIds,
  getOrderIdsForStoreLocations,
  type AuthenticatedTenantRequest,
} from "../../utils/tenant-context"
import OrderStoreLocationLink from "../../links/order-store-location"

const EMPTY_ORDER_PAGE = { orders: [], count: 0, offset: 0, limit: 0 }

// ---------------------------------------------------------------------------
// Middleware #1 — Order Listing  (GET /admin/orders)
// ---------------------------------------------------------------------------

export const scopeStoreOrderList = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const allowedStoreLocationIds = await resolveAllowedStoreLocationIds(
      req as AuthenticatedTenantRequest
    )

    // No store link → franchise-wide user. Franchise scope (already applied by
    // the upstream middleware) is the only boundary. Add nothing.
    if (allowedStoreLocationIds === null) {
      return next()
    }

    if (!allowedStoreLocationIds.length) {
      // Store-scoped user whose link resolved to no branches → fail closed.
      res.status(200).json(EMPTY_ORDER_PAGE)
      return
    }

    const storeOrderIds = await getOrderIdsForStoreLocations(
      req,
      allowedStoreLocationIds
    )

    if (!storeOrderIds.length) {
      // No orders exist for this manager's branch(es) yet. Short-circuit rather
      // than inject an empty `id: []` filter (which Medusa would ignore, leaking
      // the whole franchise-scoped page).
      res.status(200).json(EMPTY_ORDER_PAGE)
      return
    }

    // Intersect with any `id` filter the franchise layer or client already set,
    // so store scoping can only ever tighten the result.
    const existingIdFilter = (req.filterableFields as Record<string, unknown>)
      ?.id
    let effectiveIds = storeOrderIds
    if (existingIdFilter) {
      const requested = Array.isArray(existingIdFilter)
        ? (existingIdFilter as string[])
        : [existingIdFilter as string]
      effectiveIds = storeOrderIds.filter((id) => requested.includes(id))
      if (!effectiveIds.length) {
        res.status(200).json(EMPTY_ORDER_PAGE)
        return
      }
    }

    req.filterableFields = {
      ...(req.filterableFields ?? {}),
      id: effectiveIds,
    }

    next()
  } catch (err: unknown) {
    // Fail closed on unexpected errors — surface to Medusa's error handler
    // rather than silently widening access.
    next(err)
  }
}

// ---------------------------------------------------------------------------
// Middleware #2 — Single Order Guard  (GET/POST/… /admin/orders/:id)
// ---------------------------------------------------------------------------

export const guardStoreOrderSingleResource = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const orderId = req.params?.id
    if (!orderId) {
      next()
      return
    }

    const allowedStoreLocationIds = await resolveAllowedStoreLocationIds(
      req as AuthenticatedTenantRequest
    )

    if (allowedStoreLocationIds === null) {
      // Franchise-wide user — franchise guard already validated ownership.
      return next()
    }

    if (!allowedStoreLocationIds.length) {
      res.status(403).json({
        message: "Forbidden: no store locations are assigned to your account.",
        code: "STORE_NO_LOCATION",
      })
      return
    }

    // Confirm this order is linked to one of the manager's store locations.
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: links } = await query.graph({
      entity: OrderStoreLocationLink.entryPoint,
      fields: ["store_location_id"],
      filters: {
        order_id: orderId,
        store_location_id: allowedStoreLocationIds,
      },
    })

    if (!links.length) {
      res.status(403).json({
        message:
          "Forbidden: this order does not belong to your store location.",
        code: "STORE_ORDER_ACCESS_DENIED",
      })
      return
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}
