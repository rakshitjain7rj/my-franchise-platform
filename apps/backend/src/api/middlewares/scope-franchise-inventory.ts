/**
 * @file scope-franchise-inventory.ts
 * @description Tenant-scoping middleware for /admin/inventory-items routes.
 *
 * Security Model
 * ──────────────
 * Inventory Items are linked to Product Variants, which belong to Products,
 * which are linked to Franchises. The ownership chain is:
 *
 *   User ──[franchise-user]──► Franchise
 *   Franchise ──[franchise-product]──► Products
 *   Products ──► ProductVariants
 *   ProductVariants ──[product_variant_inventory_item]──► InventoryItems
 *
 * For the list endpoint we inject an `id` allow-list into filterableFields.
 * For single-resource endpoints (:id) we perform an explicit ownership check.
 *
 * Super Admins bypass all checks.
 */

import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  isSuperAdminUser,
  getInventoryItemIdsForFranchises,
  type AuthenticatedTenantRequest,
} from "../../utils/tenant-context"

export const filterAdminInventoryByFranchise = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const isSuper = await isSuperAdminUser(req)
    if (isSuper) return next()

    // Resolve the authenticated admin's franchise IDs.
    let franchiseIds: string[]
    try {
      franchiseIds = await resolveAdminFranchiseIds(req as AuthenticatedTenantRequest)
    } catch {
      // NOT_ALLOWED → unlinked user with no franchise, return empty
      res.status(200).json({ inventory_items: [], count: 0, offset: 0, limit: 0 })
      return
    }

    if (!franchiseIds.length) {
      res.status(200).json({ inventory_items: [], count: 0, offset: 0, limit: 0 })
      return
    }

    // Resolve inventory item IDs the franchise is allowed to access
    const allowedItemIds = await getInventoryItemIdsForFranchises(req, franchiseIds)

    // Single-resource guard: GET/PATCH/DELETE /admin/inventory-items/:id
    const requestedId = req.params?.id
    if (requestedId) {
      if (!allowedItemIds.includes(requestedId)) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "Inventory item not found"
        )
      }
    } else if (!allowedItemIds.length) {
      // CRITICAL: Medusa ignores an empty `id: []` filter and would return ALL
      // inventory items. Short-circuit with an empty result instead.
      res.status(200).json({ inventory_items: [], count: 0, offset: 0, limit: 0 })
      return
    }

    // Inject allow-list so Medusa list handler applies WHERE id IN (...)
    req.filterableFields = {
      ...(req.filterableFields ?? {}),
      id: allowedItemIds,
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}
