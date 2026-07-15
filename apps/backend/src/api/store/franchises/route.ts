import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * GET /store/franchises
 *
 * Public discovery endpoint for the location picker.
 * Returns all active franchise locations with geo and operational data so the
 * map can render markers and the sidebar can list available bakeries.
 *
 * This endpoint is intentionally exempt from the `x-franchise-id` header
 * requirement — users need to discover franchises *before* selecting one.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const franchiseService = req.scope.resolve("franchise") as {
    listFranchises: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        id: string
        name: string
        code: string
        is_active: boolean
        latitude?: number | null
        longitude?: number | null
        address?: string | null
        hours?: string | null
        metadata?: Record<string, unknown> | null
      }>
    >
  }

  const franchises = await franchiseService.listFranchises(
    { is_active: true },
    {
      select: [
        "id",
        "name",
        "code",
        "is_active",
        "latitude",
        "longitude",
        "address",
        "hours",
      ],
    }
  )

  // Map to the shape expected by the frontend map-routing page.
  const locations = franchises.map((f) => ({
    id: f.id,
    name: f.name,
    code: f.code,
    latitude: f.latitude ?? null,
    longitude: f.longitude ?? null,
    address: f.address ?? "",
    hours: f.hours ?? null,
  }))

  res.json({ locations })
}
