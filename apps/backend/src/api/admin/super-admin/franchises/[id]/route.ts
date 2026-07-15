import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { assertSuperAdmin } from "../../helper"

// ---------------------------------------------------------------------------
// PATCH /admin/super-admin/franchises/:id
// ---------------------------------------------------------------------------
interface UpdateFranchiseBody {
  name?: string
  code?: string
  is_active?: boolean
  metadata?: Record<string, any>
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<UpdateFranchiseBody>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const { id } = req.params as { id: string }
  const { name, code, is_active, metadata } = req.body

  const franchiseModuleService = req.scope.resolve<any>("franchise")

  // Ensure franchise exists
  const existing = await franchiseModuleService.listFranchises({ id })
  if (existing.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Franchise with ID "${id}" not found.`
    )
  }

  const franchise = existing[0]

  const updateData: any = { id }

  if (name !== undefined) {
    if (!name || typeof name !== "string") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Name must be a non-empty string."
      )
    }
    updateData.name = name
  }

  if (code !== undefined) {
    if (!code || typeof code !== "string" || !/^[a-z0-9-]+$/.test(code)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Code must be a slug consisting of lowercase letters, numbers, and dashes."
      )
    }
    // Check uniqueness if changing the code
    if (code !== franchise.code) {
      const codeConflict = await franchiseModuleService.listFranchises({ code })
      if (codeConflict.length > 0) {
        throw new MedusaError(
          MedusaError.Types.DUPLICATE_ERROR,
          `Franchise with code "${code}" already exists.`
        )
      }
    }
    updateData.code = code
  }

  if (is_active !== undefined) {
    updateData.is_active = Boolean(is_active)
  }

  if (metadata !== undefined) {
    updateData.metadata = {
      ...(franchise.metadata ?? {}),
      ...metadata,
    }
  }

  const result = await franchiseModuleService.updateFranchises([updateData])

  res.json({ franchise: result[0] })
}

// ---------------------------------------------------------------------------
// DELETE /admin/super-admin/franchises/:id
// ---------------------------------------------------------------------------
export const DELETE = async (
  req: AuthenticatedMedusaRequest<undefined>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const { id } = req.params as { id: string }

  const franchiseModuleService = req.scope.resolve<any>("franchise")

  // Ensure franchise exists
  const existing = await franchiseModuleService.listFranchises({ id })
  if (existing.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Franchise with ID "${id}" not found.`
    )
  }

  const franchise = existing[0]

  // Delete all store locations belonging to this franchise first to avoid foreign key constraints
  const locations = await franchiseModuleService.listStoreLocations({
    franchise_id: id,
  })
  if (locations.length > 0) {
    await franchiseModuleService.deleteStoreLocations(
      locations.map((loc: any) => loc.id)
    )
  }

  await franchiseModuleService.deleteFranchises([id])

  res.json({
    success: true,
    message: `Franchise "${franchise.name}" deleted successfully.`,
  })
}
