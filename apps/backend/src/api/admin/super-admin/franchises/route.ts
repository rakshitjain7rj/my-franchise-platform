import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { assertSuperAdmin } from "../helper"

// ---------------------------------------------------------------------------
// GET /admin/super-admin/franchises
// ---------------------------------------------------------------------------
export const GET = async (
  req: AuthenticatedMedusaRequest<undefined>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: [
      "id",
      "name",
      "code",
      "is_active",
      "metadata",
      "created_at",
      "updated_at",
      "store_locations.id",
      "store_locations.name",
    ],
  })

  res.json({ franchises })
}

// ---------------------------------------------------------------------------
// POST /admin/super-admin/franchises
// ---------------------------------------------------------------------------
interface CreateFranchiseBody {
  name: string
  code: string
  is_active?: boolean
  metadata?: Record<string, any>
}

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateFranchiseBody>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const { name, code, is_active, metadata } = req.body

  if (!name || typeof name !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Name must be a non-empty string."
    )
  }

  if (!code || typeof code !== "string" || !/^[a-z0-9-]+$/.test(code)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Code must be a slug consisting of lowercase letters, numbers, and dashes (e.g. 'amritsar-downtown')."
    )
  }

  const franchiseModuleService = req.scope.resolve<any>("franchise")

  // Check unique code constraint first
  const existing = await franchiseModuleService.listFranchises({ code })
  if (existing.length > 0) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      `Franchise with code "${code}" already exists.`
    )
  }

  const result = await franchiseModuleService.createFranchises([
    {
      name,
      code,
      is_active: is_active ?? true,
      metadata: metadata ?? {},
    },
  ])

  res.status(201).json({ franchise: result[0] })
}
