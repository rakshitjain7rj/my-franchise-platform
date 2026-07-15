import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { assertSuperAdmin } from "../../helper"
import { deleteStoreLocationWorkflow } from "../../../../../workflows/delete-store-location"
import {
  clearDefaultStoreLocation,
  setDefaultStoreLocation,
} from "../../../../../utils/default-store-location"

// ---------------------------------------------------------------------------
// PATCH /admin/super-admin/locations/:id
// ---------------------------------------------------------------------------
interface UpdateLocationBody {
  name?: string
  code?: string
  // franchise_id is intentionally omitted — it is immutable after creation.
  // Reassigning a location to a different franchise severs its stock-location
  // links without cascading updates, which corrupts inventory scoping.
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

export const PATCH = async (
  req: AuthenticatedMedusaRequest<UpdateLocationBody>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const { id } = req.params as { id: string }
  const fields = req.body

  // Guard: franchise_id is immutable. Reassigning a location severs its
  // stock-location link engine connections without cascading the change.
  if ((fields as any).franchise_id !== undefined) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "franchise_id cannot be changed after a location is created. Create a new location instead."
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

  if (fields.code !== undefined) {
    if (!fields.code || typeof fields.code !== "string") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Code must be a non-empty string."
      )
    }
    if (fields.code !== location.code) {
      const codeConflict = await franchiseModuleService.listStoreLocations({ code: fields.code })
      if (codeConflict.length > 0) {
        throw new MedusaError(
          MedusaError.Types.DUPLICATE_ERROR,
          `Location code "${fields.code}" already exists.`
        )
      }
    }
    updateData.code = fields.code
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

  // is_default is handled separately so we can enforce the one-default-per-
  // franchise invariant (demote siblings when promoting).
  const wantsDefaultChange = fields.is_default !== undefined
  const nextIsDefault = wantsDefaultChange ? Boolean(fields.is_default) : null

  // Refuse to promote an inactive location — storefront only auto-selects
  // active defaults, so marking a hidden branch as default would be a no-op.
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

  // Deactivating a location must also strip its default status so the
  // storefront never auto-selects a hidden branch.
  const willDeactivate =
    fields.is_active !== undefined &&
    Boolean(fields.is_active) === false &&
    Boolean(location.is_default)

  // Apply non-default fields first (name, toggles, etc.).
  let updatedLocation = location
  const hasScalarUpdates = Object.keys(updateData).length > 1 // more than just `id`
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
// DELETE /admin/super-admin/locations/:id
// ---------------------------------------------------------------------------
export const DELETE = async (
  req: AuthenticatedMedusaRequest<undefined>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const { id } = req.params as { id: string }
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

  // Atomic workflow: dismisses all links, deletes StockLocation, then StoreLocation
  await deleteStoreLocationWorkflow(req.scope).run({
    input: { store_location_id: id },
  })

  res.json({
    success: true,
    message: `Store location ${location.name} and all associated resources deleted successfully.`,
  })
}
