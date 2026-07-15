import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  isSuperAdminUser,
  getStockLocationIdsForFranchises,
  type AuthenticatedTenantRequest,
} from "../../utils/tenant-context"

/**
 * Middleware that filters and restricts stock location endpoints.
 * - Super admins: pass through unfiltered.
 * - Franchise admins: block mutating actions (POST, PUT, DELETE); filter read results (GET) to their franchise's stock locations.
 */
export const filterAdminStockLocationsByFranchise = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const isSuper = await isSuperAdminUser(req)
    if (isSuper) {
      return next()
    }

    // Block write/mutation actions for standard franchise admins
    if (["POST", "PUT", "DELETE"].includes(req.method)) {
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "Access denied: only global administrators can modify stock locations."
      )
    }

    const franchiseIds = await resolveAdminFranchiseIds(req as AuthenticatedTenantRequest)
    if (!franchiseIds.length) {
      res.status(200).json({ stock_locations: [], count: 0, offset: 0, limit: 0 })
      return
    }

    const allowedStockLocationIds = await getStockLocationIdsForFranchises(req, franchiseIds)

    const requestedId = req.params?.id
    if (requestedId) {
      if (!allowedStockLocationIds.includes(requestedId)) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "Stock location not found"
        )
      }
    } else if (!allowedStockLocationIds.length) {
      // CRITICAL: Medusa ignores an empty `id: []` filter and would return ALL
      // stock locations. Short-circuit with an empty result instead.
      res.status(200).json({ stock_locations: [], count: 0, offset: 0, limit: 0 })
      return
    }

    // Mutate filterableFields so Medusa list filters by these IDs
    req.filterableFields = {
      ...(req.filterableFields ?? {}),
      id: allowedStockLocationIds,
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}
