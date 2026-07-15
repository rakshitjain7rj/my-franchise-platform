import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseContext,
  type AuthenticatedTenantRequest,
} from "../../../utils/tenant-context"
import { createStoreLocationWorkflow } from "../../../workflows/create-store-location"

// ---------------------------------------------------------------------------
// GET /admin/franchise-locations
// ---------------------------------------------------------------------------
export const GET = async (
  req: AuthenticatedMedusaRequest<undefined>,
  res: MedusaResponse
) => {
  const tenantReq = req as AuthenticatedTenantRequest
  const franchiseId = await resolveAdminFranchiseContext(tenantReq)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: locations } = await query.graph({
    entity: "store_location",
    fields: [
      "id",
      "name",
      "code",
      "address",
      "latitude",
      "longitude",
      "is_active",
      "is_accepting_orders",
      "is_default",
      "custom_lead_time_hours",
      "opening_hours",
      "daily_order_capacity",
      "franchise.id",
      "franchise.name",
      "created_at",
      "updated_at",
    ],
    filters: { franchise_id: franchiseId },
  })

  res.json({ locations })
}

// ---------------------------------------------------------------------------
// POST /admin/franchise-locations
// ---------------------------------------------------------------------------
interface CreateLocationBody {
  name: string
  address?: string
  latitude?: number
  longitude?: number
  is_active?: boolean
  is_accepting_orders?: boolean
  custom_lead_time_hours?: number
  daily_order_capacity?: number
  opening_hours?: Record<string, any>
  metadata?: Record<string, any>
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateLocationBody>,
  res: MedusaResponse
) => {
  const tenantReq = req as AuthenticatedTenantRequest
  const franchiseId = await resolveAdminFranchiseContext(tenantReq)

  const {
    name,
    address,
    latitude,
    longitude,
    is_active,
    is_accepting_orders,
    custom_lead_time_hours,
    daily_order_capacity,
    opening_hours,
    metadata,
  } = req.body

  if (!name || typeof name !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Name must be a non-empty string."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const franchiseModuleService = req.scope.resolve<any>("franchise")

  // Fetch the franchise to get its code
  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id", "code"],
    filters: { id: franchiseId },
  })

  if (!franchises.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Franchise with ID "${franchiseId}" not found.`
    )
  }

  const franchise = franchises[0]
  
  // Auto-generate store code to convention: <FRANCHISE_CODE>-<SLUG>
  const baseCode = `${franchise.code}-${slugify(name)}`.toUpperCase()
  let generatedCode = baseCode
  let counter = 1

  while (true) {
    const existing = await franchiseModuleService.listStoreLocations({
      code: generatedCode,
    })
    if (existing.length === 0) {
      break
    }
    generatedCode = `${baseCode}-${counter}`
    counter++
  }

  // Atomic workflow: creates StoreLocation + StockLocation + link + sales-channel
  const { result } = await createStoreLocationWorkflow(req.scope).run({
    input: {
      name,
      code: generatedCode,
      franchise_id: franchiseId,
      address: address ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      is_active: is_active ?? true,
      is_accepting_orders: is_accepting_orders ?? true,
      custom_lead_time_hours: custom_lead_time_hours ?? 24,
      daily_order_capacity: daily_order_capacity ?? 10,
      // undefined → workflow applies DEFAULT_OPENING_HOURS (never leave null)
      opening_hours: opening_hours ?? undefined,
      metadata: metadata ?? null,
    },
  })

  res.status(201).json({
    store_location: result.store_location,
    stock_location: result.stock_location,
    // Backward-compatible alias
    location: result.store_location,
  })
}
