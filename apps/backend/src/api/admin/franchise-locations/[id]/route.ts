import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  type AuthenticatedTenantRequest,
} from "../../../../utils/tenant-context"
import { deleteStoreLocationWorkflow } from "../../../../workflows/delete-store-location"

import {
  clearDefaultStoreLocation,
  setDefaultStoreLocation,
} from "../../../../utils/default-store-location"

interface UpdateLocationBody {
  name?: string
  address?: string
  latitude?: number
  longitude?: number
  is_active?: boolean
  is_accepting_orders?: boolean
  /** Promote / demote this location as the franchise-wide default store. */
  is_default?: boolean
  custom_lead_time_hours?: number
  daily_order_capacity?: number
  opening_hours?: Record<string, any>
  metadata?: Record<string, any>
}

// ---------------------------------------------------------------------------
// PATCH /admin/franchise-locations/:id
// ---------------------------------------------------------------------------
export const PATCH = async (
  req: AuthenticatedMedusaRequest<UpdateLocationBody>,
  res: MedusaResponse
) => {
  const tenantReq = req as AuthenticatedTenantRequest
  const allowedFranchises = await resolveAdminFranchiseIds(tenantReq)
  const { id } = req.params as { id: string }
  const fields = req.body

  // Guard: franchise_id and code cannot be modified by franchise admins
  if ((fields as any).franchise_id !== undefined || (fields as any).code !== undefined) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Cannot modify franchise_id or code on this location."
    )
  }

  const franchiseModuleService = req.scope.resolve<any>("franchise")

  // Ensure location exists
  const existing = await franchiseModuleService.listStoreLocations({ id })
  if (existing.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Store location with ID "${id}" not found.`
    )
  }

  const location = existing[0]

  // Enforce boundary check: check that existing location belongs to the caller's allowed franchises
  if (!allowedFranchises.includes(location.franchise_id)) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "You are not authorized to update this store location."
    )
  }

  const updateData: any = { id }

  if (fields.name !== undefined) {
    if (!fields.name || typeof fields.name !== "string") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Name must be a non-empty string."
      )
    }
    updateData.name = fields.name
  }

  if (fields.address !== undefined) {
    updateData.address = fields.address ?? null
  }

  if (fields.latitude !== undefined) {
    updateData.latitude = fields.latitude ?? null
  }

  if (fields.longitude !== undefined) {
    updateData.longitude = fields.longitude ?? null
  }

  if (fields.is_active !== undefined) {
    updateData.is_active = Boolean(fields.is_active)
  }

  if (fields.is_accepting_orders !== undefined) {
    updateData.is_accepting_orders = Boolean(fields.is_accepting_orders)
  }

  if (fields.custom_lead_time_hours !== undefined) {
    updateData.custom_lead_time_hours = Number(fields.custom_lead_time_hours)
  }

  if (fields.daily_order_capacity !== undefined) {
    updateData.daily_order_capacity = Number(fields.daily_order_capacity)
  }

  if (fields.opening_hours !== undefined) {
    updateData.opening_hours = fields.opening_hours ?? null
  }

  if (fields.metadata !== undefined) {
    updateData.metadata = {
      ...(location.metadata ?? {}),
      ...fields.metadata,
    }
  }

  const wantsDefaultChange = fields.is_default !== undefined
  const nextIsDefault = wantsDefaultChange ? Boolean(fields.is_default) : null

  if (nextIsDefault === true) {
    const willBeActive =
      fields.is_active !== undefined
        ? Boolean(fields.is_active)
        : Boolean(location.is_active)
    if (!willBeActive) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Cannot mark an inactive location as the default store. Activate it first."
      )
    }
  }

  const willDeactivate =
    fields.is_active !== undefined &&
    Boolean(fields.is_active) === false &&
    Boolean(location.is_default)

  let updatedLocation = location
  const hasScalarUpdates = Object.keys(updateData).length > 1
  if (hasScalarUpdates) {
    const result = await franchiseModuleService.updateStoreLocations([updateData])
    updatedLocation = result[0]
  }

  if (wantsDefaultChange) {
    if (nextIsDefault) {
      updatedLocation = await setDefaultStoreLocation(
        franchiseModuleService,
        id,
        location.franchise_id
      )
    } else {
      updatedLocation = await clearDefaultStoreLocation(franchiseModuleService, id)
    }
  } else if (willDeactivate) {
    updatedLocation = await clearDefaultStoreLocation(franchiseModuleService, id)
  }

  res.json({ location: updatedLocation })
}

// ---------------------------------------------------------------------------
// DELETE /admin/franchise-locations/:id
// ---------------------------------------------------------------------------
export const DELETE = async (
  req: AuthenticatedMedusaRequest<undefined>,
  res: MedusaResponse
) => {
  const tenantReq = req as AuthenticatedTenantRequest
  const allowedFranchises = await resolveAdminFranchiseIds(tenantReq)
  const { id } = req.params as { id: string }

  const franchiseModuleService = req.scope.resolve<any>("franchise")

  const existing = await franchiseModuleService.listStoreLocations({ id })
  if (existing.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Store location with ID "${id}" not found.`
    )
  }

  const location = existing[0]

  if (!allowedFranchises.includes(location.franchise_id)) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "You are not authorized to delete this store location."
    )
  }

  // Atomic workflow: dismisses all links, deletes StockLocation, then StoreLocation
  await deleteStoreLocationWorkflow(req.scope).run({
    input: { store_location_id: id },
  })

  res.json({
    success: true,
    message: `Store location ${location.name} and all associated resources deleted successfully.`,
  })
}
