/**
 * @file scope-franchise-reservations.ts
 * @description Tenant-scoping middleware for /admin/reservations routes.
 *
 * Security Model
 * ──────────────
 * Reservations are held at a StockLocation, which is linked to a
 * StoreLocation, which belongs to a Franchise:
 *
 *   User ──[franchise-user]──► Franchise
 *   Franchise ──► StoreLocations
 *   StoreLocations ──[store-location-stock-location]──► StockLocations
 *   StockLocations ──► Reservations (via location_id)
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
  getStockLocationIdsForFranchises,
  resolveAllowedStoreLocationIds,
  getStockLocationIdsForStoreLocations,
  type AuthenticatedTenantRequest,
} from "../../utils/tenant-context"

export const filterAdminReservationsByFranchise = async (
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
      res.status(200).json({ reservations: [], count: 0, offset: 0, limit: 0 })
      return
    }

    if (!franchiseIds.length) {
      res.status(200).json({ reservations: [], count: 0, offset: 0, limit: 0 })
      return
    }

    // Resolve stock location IDs for this franchise
    const franchiseStockLocationIds = await getStockLocationIdsForFranchises(req, franchiseIds)
    if (!franchiseStockLocationIds.length) {
      res.status(200).json({ reservations: [], count: 0, offset: 0, limit: 0 })
      return
    }

    // Store-level (Tier 2) narrowing: if this admin is bound to specific store
    // locations (branch manager), restrict to just those branches' stock
    // locations. Franchise-wide admins (no store link) keep the full set.
    let allowedStockLocationIds = franchiseStockLocationIds
    const allowedStoreLocationIds = await resolveAllowedStoreLocationIds(
      req as AuthenticatedTenantRequest
    )
    if (allowedStoreLocationIds !== null) {
      const storeStockLocationIds = await getStockLocationIdsForStoreLocations(
        req,
        allowedStoreLocationIds
      )
      // Intersect franchise stock locations with the manager's branch stock
      // locations so a store link can only ever tighten, never widen, access.
      allowedStockLocationIds = franchiseStockLocationIds.filter((id) =>
        storeStockLocationIds.includes(id)
      )
      if (!allowedStockLocationIds.length) {
        res.status(200).json({ reservations: [], count: 0, offset: 0, limit: 0 })
        return
      }
    }

    // Mutation guard: on create (POST) or update, the target stock location is
    // supplied in the body. Reject any write that points at a stock location
    // outside the franchise — this blocks both cross-tenant reservation creation
    // and moving an owned reservation onto another franchise's location.
    if (req.method === "POST") {
      const bodyLocationId =
        (req.validatedBody as { location_id?: string } | undefined)?.location_id ??
        (req.body as { location_id?: string } | undefined)?.location_id
      if (bodyLocationId && !allowedStockLocationIds.includes(bodyLocationId)) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "Stock location not found"
        )
      }
    }

    // Single-resource guard: verify the reservation's location_id is in the allowed set
    const requestedId = req.params?.id
    if (requestedId) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: records } = await query.graph({
        entity: "reservation_item",
        fields: ["location_id"],
        filters: { id: requestedId },
      })

      const record = (records as Array<{ location_id?: string }>)[0]
      if (!record || !record.location_id || !allowedStockLocationIds.includes(record.location_id)) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "Reservation not found"
        )
      }
    }

    // Inject location_id allow-list
    req.filterableFields = {
      ...(req.filterableFields ?? {}),
      location_id: allowedStockLocationIds,
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}
