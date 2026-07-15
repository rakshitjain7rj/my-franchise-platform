/**
 * @file scope-franchise-customers.ts
 * @description Tenant-scoping middleware for /admin/customers routes.
 *
 * Security Model
 * ──────────────
 * Customers are associated with a franchise through their orders.
 * The ownership chain is:
 *
 *   User ──[franchise-user]──► Franchise
 *   Franchise ──[franchise-store]──► Store ──► SalesChannels
 *   SalesChannels ──► Orders ──► customer_id
 *
 * We resolve the set of customer IDs who have placed at least one order
 * in the franchise's sales channels, then restrict list/detail endpoints
 * to that set.
 *
 * Super Admins bypass all checks.
 */

import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  isSuperAdminUser,
  getSalesChannelIdsForFranchises,
  type AuthenticatedTenantRequest,
} from "../../utils/tenant-context"

/**
 * Resolves the set of customer IDs who have at least one order
 * in the given sales channels.
 */
const getCustomerIdsForSalesChannels = async (
  req: MedusaRequest,
  salesChannelIds: string[]
): Promise<string[]> => {
  if (!salesChannelIds.length) return []

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["customer_id"],
    filters: { sales_channel_id: salesChannelIds },
  })

  return Array.from(
    new Set(
      (orders as Array<{ customer_id?: string }>)
        .map((o) => o.customer_id)
        .filter((id): id is string => Boolean(id))
    )
  )
}

export const filterAdminCustomersByFranchise = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const isSuper = await isSuperAdminUser(req)
    if (isSuper) return next()

    let franchiseIds: string[]
    try {
      franchiseIds = await resolveAdminFranchiseIds(req as AuthenticatedTenantRequest)
    } catch {
      res.status(200).json({ customers: [], count: 0, offset: 0, limit: 0 })
      return
    }

    if (!franchiseIds.length) {
      res.status(200).json({ customers: [], count: 0, offset: 0, limit: 0 })
      return
    }

    // Franchise → SalesChannels → Orders → customer_ids
    const salesChannelIds = await getSalesChannelIdsForFranchises(req, franchiseIds)
    if (!salesChannelIds.length) {
      res.status(200).json({ customers: [], count: 0, offset: 0, limit: 0 })
      return
    }

    const allowedCustomerIds = await getCustomerIdsForSalesChannels(req, salesChannelIds)

    // Single-resource guard
    const requestedId = req.params?.id
    if (requestedId) {
      if (!allowedCustomerIds.includes(requestedId)) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "Customer not found"
        )
      }
    } else if (!allowedCustomerIds.length) {
      // CRITICAL: Medusa ignores an empty `id: []` filter and would return ALL
      // customers. Short-circuit with an empty result instead of injecting an
      // empty allow-list, otherwise the tenant boundary leaks.
      res.status(200).json({ customers: [], count: 0, offset: 0, limit: 0 })
      return
    }

    // Inject allow-list
    req.filterableFields = {
      ...(req.filterableFields ?? {}),
      id: allowedCustomerIds,
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}
