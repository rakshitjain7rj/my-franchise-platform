import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { assertSuperAdmin } from "../helper"
import { provisionStoreLocation } from "../../../../utils/provision-store-location"

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

  // Super-admin supplies an explicit network-unique code.
  if (!code || typeof code !== "string" || !code.trim()) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Code must be a non-empty string."
    )
  }

  const result = await provisionStoreLocation(req.scope, {
    name,
    code: code.trim(),
    franchise_id,
    address: address ?? null,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    is_active,
    is_accepting_orders,
    custom_lead_time_hours,
    daily_order_capacity,
    opening_hours: opening_hours ?? null,
    metadata: metadata ?? null,
  })

  res.status(201).json({
    store_location: result.store_location,
    stock_location: result.stock_location,
    // Backward-compatible alias
    location: result.store_location,
  })
}
