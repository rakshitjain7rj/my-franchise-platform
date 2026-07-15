import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { assertSuperAdmin } from "../helper"
import { createStoreLocationWorkflow } from "../../../../workflows/create-store-location"

// ---------------------------------------------------------------------------
// GET /admin/super-admin/locations
// ---------------------------------------------------------------------------
export const GET = async (
  req: AuthenticatedMedusaRequest<undefined>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

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
  })

  res.json({ locations })
}

// ---------------------------------------------------------------------------
// POST /admin/super-admin/locations
// ---------------------------------------------------------------------------
interface CreateLocationBody {
  name: string
  code: string
  franchise_id: string
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

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateLocationBody>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const {
    name,
    code,
    franchise_id,
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

  if (!code || typeof code !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Code must be a non-empty string."
    )
  }

  if (!franchise_id || typeof franchise_id !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "franchise_id is required."
    )
  }

  const franchiseModuleService = req.scope.resolve<any>("franchise")

  // Ensure franchise exists
  const franchiseList = await franchiseModuleService.listFranchises({ id: franchise_id })
  if (franchiseList.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Franchise with ID "${franchise_id}" not found.`
    )
  }

  // Ensure location code is unique across the network
  const existingCode = await franchiseModuleService.listStoreLocations({ code })
  if (existingCode.length > 0) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      `Location code "${code}" already exists.`
    )
  }

  // Atomic workflow: creates StoreLocation + StockLocation + link + sales-channel
  const { result } = await createStoreLocationWorkflow(req.scope).run({
    input: {
      name,
      code,
      franchise_id,
      address: address ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      is_active: is_active ?? true,
      is_accepting_orders: is_accepting_orders ?? true,
      custom_lead_time_hours: custom_lead_time_hours ?? 24,
      daily_order_capacity: daily_order_capacity ?? 10,
      // Prefer caller-supplied hours; otherwise platform default so slots
      // never go empty solely because opening_hours was left null.
      // Workflow also defaults — keep both paths on the same constant.
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
