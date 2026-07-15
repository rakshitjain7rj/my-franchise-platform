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
 * Uses Google Distance Matrix when GOOGLE_MAPS_API_KEY is set; otherwise
 * haversine × road factor. Results cached ~15 minutes in-process.
 *
 * Money: GBP major units.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  DEFAULT_DELIVERY_FEE_CONFIG,
  cacheGet,
  cacheSet,
  computeDeliveryFee,
  haversineKm,
} from "../../../../../utils/logistics"

const CACHE_TTL_MS = 15 * 60 * 1000

type StoreLoc = {
  id: string
  name: string
  franchise_id: string
  latitude: number | null
  longitude: number | null
  address: string | null
  is_active: boolean
  metadata: Record<string, unknown> | null
}

type GeoPoint = { lat: number; lng: number }

async function geocodeUkPostcode(postcode: string): Promise<GeoPoint | null> {
  const key = `geo:pc:${postcode.toUpperCase().replace(/\s+/g, "")}`
  const cached = cacheGet<GeoPoint>(key)
  if (cached) return cached

  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const json = (await res.json()) as {
      result?: { latitude?: number; longitude?: number }
    }
    if (
      json.result?.latitude == null ||
      json.result?.longitude == null
    ) {
      return null
    }
    const point = {
      lat: Number(json.result.latitude),
      lng: Number(json.result.longitude),
    }
    cacheSet(key, point, CACHE_TTL_MS)
    return point
  } catch {
    return null
  }
}

async function googleDrivingDistanceKm(
  origin: GeoPoint,
  dest: GeoPoint
): Promise<{ km: number; minutes: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim()
  if (!apiKey) return null

  const cacheKey = `gdm:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}>${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`
  const cached = cacheGet<{ km: number; minutes: number }>(cacheKey)
  if (cached) return cached

  try {
    const url = new URL(
      "https://maps.googleapis.com/maps/api/distancematrix/json"
    )
    url.searchParams.set("origins", `${origin.lat},${origin.lng}`)
    url.searchParams.set("destinations", `${dest.lat},${dest.lng}`)
    url.searchParams.set("units", "metric")
    url.searchParams.set("mode", "driving")
    url.searchParams.set("key", apiKey)

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      rows?: Array<{
        elements?: Array<{
          status?: string
          distance?: { value?: number }
          duration?: { value?: number }
        }>
      }>
    }
    const el = json.rows?.[0]?.elements?.[0]
    if (!el || el.status !== "OK" || el.distance?.value == null) return null

    const result = {
      km: el.distance.value / 1000,
      minutes: Math.round((el.duration?.value ?? 0) / 60),
    }
    cacheSet(cacheKey, result, CACHE_TTL_MS)
    return result
  } catch {
    return null
  }
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

  let dest: GeoPoint | null = null
  if (Number.isFinite(destLat) && Number.isFinite(destLng)) {
    dest = { lat: destLat, lng: destLng }
  } else if (postcode) {
    dest = await geocodeUkPostcode(postcode)
    if (!dest) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Could not resolve that postcode. Please check and try again."
      )
    }
  } else {
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

  if (location.latitude == null || location.longitude == null) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "This bakery has no map coordinates configured for delivery."
    )
  }

  const origin: GeoPoint = {
    lat: Number(location.latitude),
    lng: Number(location.longitude),
  }

  const cfg = DEFAULT_DELIVERY_FEE_CONFIG
  const radiusKm =
    Number(location.metadata?.delivery_radius_km) || cfg.defaultRadiusKm

  // Prefer Google driving distance; fall back to haversine × road factor
  let distanceKm: number
  let durationMinutes: number | null = null
  let source: "google" | "haversine" = "haversine"

  const google = await googleDrivingDistanceKm(origin, dest)
  if (google) {
    distanceKm = google.km
    durationMinutes = google.minutes
    source = "google"
  } else {
    distanceKm = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng) * cfg.roadFactor
  }

  distanceKm = Math.round(distanceKm * 100) / 100

  if (distanceKm > radiusKm) {
    res.status(200).json({
      deliverable: false,
      distance_km: distanceKm,
      duration_minutes: durationMinutes,
      fee: 0,
      currency_code: "gbp",
      max_radius_km: radiusKm,
      source,
      message: `Sorry — this address is outside the ${radiusKm} km delivery radius for ${location.name}.`,
    })
    return
  }

  const fee = computeDeliveryFee(distanceKm, cfg)

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info(
    `[delivery-fee] store=${storeId} dist=${distanceKm}km fee=${fee} source=${source}`
  )

  res.status(200).json({
    deliverable: true,
    distance_km: distanceKm,
    duration_minutes: durationMinutes,
    fee,
    currency_code: "gbp",
    max_radius_km: radiusKm,
    source,
    store_location_id: storeId,
  })
}
