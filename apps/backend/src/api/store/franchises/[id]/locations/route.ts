import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import StoreLocationStockLocationLink from "../../../../../links/store-location-stock-location"

/**
 * GET /store/franchises/:id/locations
 *
 * Returns all active StoreLocations for a given franchise.
 * Used by the storefront to populate the "Active Location Badge" and
 * allow users to select a specific physical bakery.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }

  const franchiseService = req.scope.resolve("franchise") as any
  const query = req.scope.resolve("query") as any

  const locations = await franchiseService.listStoreLocations(
    { franchise_id: id, is_active: true },
    {
      select: [
        "id",
        "name",
        "code",
        "address",
        "latitude",
        "longitude",
        "opening_hours",
        "daily_order_capacity",
        "is_active",
        "is_default",
        "metadata",
        "franchise_id",
      ],
    }
  )

  let links: any[] = []
  if (locations.length > 0) {
    const { data } = await query.graph({
      entity: StoreLocationStockLocationLink.entryPoint,
      fields: ["store_location_id", "stock_location_id"],
      filters: { store_location_id: locations.map((loc: any) => loc.id) },
    })
    links = data
  }

  const linkMap = new Map(
    links.map((link) => [link.store_location_id, link.stock_location_id])
  )

  const locationsWithStock = locations.map((loc: any) => ({
    ...loc,
    stock_location_id: linkMap.get(loc.id) || null,
  }))

  res.json({ locations: locationsWithStock })
}
