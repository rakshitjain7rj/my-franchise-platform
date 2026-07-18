/**
 * GET /store/stores/:id/delivery-fee
 *
 * Backend-computed delivery fee from the selected StoreLocation to a
 * destination. Client must never invent the fee — only display this result.
 *
 * Query (one of):
 *   - dest_lat + dest_lng   (WGS-84)
 *   - postcode              (UK postcode via postcodes.io)
 *
 * Pricing policy is owned by quoteLocalDelivery (same function used by the
 * fulfillment provider calculatePrice path).
 *
 * Money: GBP major units.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { quoteLocalDelivery } from "../../../../../utils/logistics"

type StoreLoc = {
  id: string
  name: string
  franchise_id: string
  latitude: number | null
  longitude: number | null
  address: string | null
  is_active: boolean
  is_accepting_orders?: boolean
  metadata: Record<string, unknown> | null
}

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> => {
  const storeId = req.params?.id
  if (!storeId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Store location id is required"
    )
  }

  const q = req.query as Record<string, string | undefined>
  const destLat = q.dest_lat != null ? Number(q.dest_lat) : NaN
  const destLng = q.dest_lng != null ? Number(q.dest_lng) : NaN
  const postcode = typeof q.postcode === "string" ? q.postcode.trim() : ""

  const dest =
    Number.isFinite(destLat) && Number.isFinite(destLng)
      ? { lat: destLat, lng: destLng }
      : null

  if (!dest && !postcode) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Provide dest_lat & dest_lng, or a UK postcode"
    )
  }

  const franchiseService = req.scope.resolve("franchise") as {
    listStoreLocations: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<StoreLoc[]>
  }

  const [location] = await franchiseService.listStoreLocations(
    { id: storeId },
    {
      select: [
        "id",
        "name",
        "franchise_id",
        "latitude",
        "longitude",
        "address",
        "is_active",
        "is_accepting_orders",
        "metadata",
      ],
    }
  )

  if (!location || location.is_active === false) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Store location ${storeId} not found`
    )
  }

  const headerFranchise =
    typeof req.headers["x-franchise-id"] === "string"
      ? req.headers["x-franchise-id"].trim()
      : ""
  if (headerFranchise && location.franchise_id !== headerFranchise) {
    res.status(200).json({
      deliverable: false,
      fee: 0,
      currency_code: "gbp",
      message: "Store does not belong to this franchise.",
    })
    return
  }

  if (location.is_accepting_orders === false) {
    res.status(200).json({
      deliverable: false,
      fee: 0,
      currency_code: "gbp",
      message: "This bakery is not accepting orders right now.",
    })
    return
  }

  const quote = await quoteLocalDelivery({
    store: location,
    dest,
    postcode: postcode || undefined,
  })

  if (quote.error === "missing_coords") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      quote.message ?? "This bakery has no map coordinates configured for delivery."
    )
  }
  if (quote.error === "unresolvable_postcode") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Could not resolve that postcode. Please check and try again."
    )
  }
  if (quote.error === "missing_destination") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Provide dest_lat & dest_lng, or a UK postcode"
    )
  }

  if (!quote.deliverable) {
    res.status(200).json({
      deliverable: false,
      distance_km: quote.distance_km,
      duration_minutes: quote.duration_minutes,
      fee: 0,
      currency_code: "gbp",
      max_radius_km: quote.max_radius_km,
      source: quote.source,
      message:
        quote.message ??
        `Sorry — this address is outside the ${quote.max_radius_km} km delivery radius for ${location.name}.`,
    })
    return
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info(
    `[delivery-fee] store=${storeId} dist=${quote.distance_km}km fee=${quote.fee} source=${quote.source}`
  )

  res.status(200).json({
    deliverable: true,
    distance_km: quote.distance_km,
    duration_minutes: quote.duration_minutes,
    fee: quote.fee,
    currency_code: "gbp",
    max_radius_km: quote.max_radius_km,
    source: quote.source,
    store_location_id: storeId,
  })
}
