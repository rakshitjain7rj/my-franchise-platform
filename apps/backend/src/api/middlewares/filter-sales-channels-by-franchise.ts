import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  isSuperAdminUser,
  type AuthenticatedTenantRequest,
} from "../../utils/tenant-context"
import FranchiseSalesChannelLink from "../../links/franchise-sales-channel"

/**
 * Middleware that filters and restricts sales channel endpoints.
 * - Super admins: pass through unfiltered.
 * - Franchise admins: block mutating actions (POST, PUT, DELETE); filter read results (GET) to their franchise's channels.
 */
export const filterAdminSalesChannelsByFranchise = async (
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
        "Access denied: only global administrators can modify sales channels."
      )
    }

    const franchiseIds = await resolveAdminFranchiseIds(req as AuthenticatedTenantRequest)
    if (!franchiseIds.length) {
      res.status(200).json({ sales_channels: [], count: 0, offset: 0, limit: 0 })
      return
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    
    // Resolve sales channels linked to these franchises
    const { data: links } = await query.graph({
      entity: FranchiseSalesChannelLink.entryPoint,
      fields: ["sales_channel_id"],
      filters: { franchise_id: franchiseIds },
    })

    const allowedSalesChannelIds = links
      .map((link: { sales_channel_id?: string }) => link.sales_channel_id)
      .filter((id): id is string => Boolean(id))

    const requestedId = req.params?.id
    if (requestedId) {
      if (!allowedSalesChannelIds.includes(requestedId)) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "Sales channel not found"
        )
      }
    } else if (!allowedSalesChannelIds.length) {
      // CRITICAL: Medusa ignores an empty `id: []` filter and would return ALL
      // sales channels. Short-circuit with an empty result instead.
      res.status(200).json({ sales_channels: [], count: 0, offset: 0, limit: 0 })
      return
    }

    // Mutate filterableFields so Medusa list filters by these IDs
    req.filterableFields = {
      ...(req.filterableFields ?? {}),
      id: allowedSalesChannelIds,
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}
