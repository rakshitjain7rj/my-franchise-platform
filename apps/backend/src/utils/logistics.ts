/**
 * Logistics helpers for time-slot generation and delivery-fee maths.
 * Money is always GBP **major units** (never pence).
 */

export type DayHours = { open: string; close: string }
export type OpeningHours = Record<string, DayHours>

export type TimeSlot = {
  /** Slot start "HH:mm" (24h) */
  time: string
  /** Slot end "HH:mm" */
  end: string
  /** Human label e.g. "09:00 – 09:30" */
  label: string
  available_capacity: number
  is_bookable: boolean
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const

/** Default bakery hours used when a store has no opening_hours configured. */
export const DEFAULT_OPENING_HOURS: OpeningHours = {
  monday: { open: "09:00", close: "18:00" },
  tuesday: { open: "09:00", close: "18:00" },
  wednesday: { open: "09:00", close: "18:00" },
  thursday: { open: "09:00", close: "18:00" },
  friday: { open: "09:00", close: "18:00" },
  saturday: { open: "09:00", close: "18:00" },
  sunday: { open: "09:00", close: "18:00" },
}

export function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

export function formatHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Expand a single open/close pair to every weekday. */
export function expandDailyHours(open: string, close: string): OpeningHours {
  const day: DayHours = { open, close }
  return {
    monday: day,
    tuesday: day,
    wednesday: day,
    thursday: day,
    friday: day,
    saturday: day,
    sunday: day,
  }
}

function hasValidDayHours(hours: OpeningHours | null | undefined): boolean {
  if (!hours || typeof hours !== "object") return false
  return Object.values(hours).some((h) => {
    if (!h || typeof h !== "object") return false
    const open = (h as DayHours).open
    const close = (h as DayHours).close
    return (
      typeof open === "string" &&
      typeof close === "string" &&
      parseHHMM(open) != null &&
      parseHHMM(close) != null
    )
  })
}

/**
 * Resolve a usable weekday map from:
 *  1. native `opening_hours` column
 *  2. legacy `metadata.store_hours` ({ open, close })
 *  3. platform default (09:00–18:00 every day)
 *
 * Seed data historically only wrote metadata.store_hours, leaving
 * opening_hours null — without this fallback the slots API returns [].
 */
export function resolveOpeningHours(
  openingHours: OpeningHours | null | undefined,
  metadata?: Record<string, unknown> | null
): OpeningHours {
  if (hasValidDayHours(openingHours)) {
    return openingHours as OpeningHours
  }

  const raw = metadata?.store_hours
  if (raw && typeof raw === "object") {
    const open = String((raw as DayHours).open ?? "").trim()
    const close = String((raw as DayHours).close ?? "").trim()
    if (parseHHMM(open) != null && parseHHMM(close) != null) {
      return expandDailyHours(open, close)
    }
  }

  return DEFAULT_OPENING_HOURS
}

/**
 * Build 30-minute slots for a calendar date from opening_hours + capacity.
 * Does not count existing bookings — caller subtracts usage.
 *
 * When openingHours is null/empty, falls back to DEFAULT_OPENING_HOURS so
 * stores seeded without the column still expose bookable slots.
 */
export function buildDaySlots(input: {
  date: string // YYYY-MM-DD
  openingHours: OpeningHours | null | undefined
  capacityPerSlot: number
  leadTimeHours: number
  now?: Date
  /** Optional metadata for legacy store_hours fallback */
  metadata?: Record<string, unknown> | null
}): TimeSlot[] {
  const { date, capacityPerSlot, leadTimeHours } = input
  const now = input.now ?? new Date()
  const openingHours = resolveOpeningHours(input.openingHours, input.metadata)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []

  // Parse as local calendar day (noon avoids DST edge issues when shifting)
  const day = new Date(`${date}T12:00:00`)
  if (Number.isNaN(day.getTime())) return []

  const weekday = WEEKDAYS[day.getDay()]
  const hours = openingHours[weekday]
  if (!hours?.open || !hours?.close) return []

  const openMin = parseHHMM(hours.open)
  const closeMin = parseHHMM(hours.close)
  if (openMin == null || closeMin == null || closeMin <= openMin) return []

  const capacity = Math.max(0, Math.floor(capacityPerSlot) || 0)
  const cutoffMs = now.getTime() + Math.max(0, leadTimeHours) * 60 * 60 * 1000

  const slots: TimeSlot[] = []
  for (let cursor = openMin; cursor + 30 <= closeMin; cursor += 30) {
    const time = formatHHMM(cursor)
    const end = formatHHMM(cursor + 30)
    const slotStart = new Date(`${date}T${time}:00`)
    const isPast = slotStart.getTime() < cutoffMs

    slots.push({
      time,
      end,
      label: `${time} – ${end}`,
      available_capacity: capacity,
      is_bookable: !isPast && capacity > 0,
    })
  }
  return slots
}

/**
 * Extract a slot start "HH:mm" from various stored formats:
 *  - "09:00"
 *  - "09:00 – 09:30"
 *  - ISO datetime
 *  - "9:00 AM - 10:00 AM"
 */
export function extractSlotStart(
  raw: string | null | undefined,
  onDate?: string
): string | null {
  if (!raw?.trim()) return null
  const v = raw.trim()

  // ISO
  if (v.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) {
      if (onDate && d.toISOString().slice(0, 10) !== onDate) {
        // compare local date
        const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        if (local !== onDate) return null
      }
      return formatHHMM(d.getHours() * 60 + (d.getMinutes() < 30 ? 0 : 30))
    }
  }

  // 24h start of range
  const m24 = /^(\d{1,2}):(\d{2})/.exec(v)
  if (m24 && !/am|pm/i.test(v)) {
    const mins = parseHHMM(`${m24[1]}:${m24[2]}`)
    if (mins == null) return null
    // snap to 30-min floor
    const snapped = Math.floor(mins / 30) * 30
    return formatHHMM(snapped)
  }

  // 12h "9:00 AM" or "12:00 PM - 1:00 PM"
  const m12 = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(v)
  if (m12) {
    let h = Number(m12[1]) % 12
    if (/pm/i.test(m12[3])) h += 12
    const mins = h * 60 + Number(m12[2])
    const snapped = Math.floor(mins / 30) * 30
    return formatHHMM(snapped)
  }

  return null
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export type DeliveryFeeConfig = {
  baseFee: number
  perKm: number
  freeUnderKm: number
  maxFee: number
  /** Road-distance multiplier when using straight-line haversine */
  roadFactor: number
  defaultRadiusKm: number
}

export const DEFAULT_DELIVERY_FEE_CONFIG: DeliveryFeeConfig = {
  baseFee: Number(process.env.DELIVERY_BASE_FEE ?? 2.5),
  perKm: Number(process.env.DELIVERY_PER_KM ?? 0.75),
  freeUnderKm: Number(process.env.DELIVERY_FREE_UNDER_KM ?? 0),
  maxFee: Number(process.env.DELIVERY_MAX_FEE ?? 15),
  roadFactor: Number(process.env.DELIVERY_ROAD_FACTOR ?? 1.3),
  defaultRadiusKm: Number(process.env.DELIVERY_DEFAULT_RADIUS_KM ?? 10),
}

/**
 * Compute delivery fee in GBP major units from driving distance.
 */
export function computeDeliveryFee(
  distanceKm: number,
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_FEE_CONFIG
): number {
  if (distanceKm < 0 || !Number.isFinite(distanceKm)) return 0
  if (distanceKm <= config.freeUnderKm) return 0
  const chargeable = Math.max(0, distanceKm - config.freeUnderKm)
  const raw = config.baseFee + chargeable * config.perKm
  const capped = Math.min(config.maxFee, raw)
  // Round to nearest 0.01 (major units)
  return Math.round(capped * 100) / 100
}

// ── Simple in-process TTL cache for Distance Matrix / geocode results ────────

type CacheEntry<T> = { value: T; expires: number }

const cacheStore = new Map<string, CacheEntry<unknown>>()

export function cacheGet<T>(key: string): T | null {
  const hit = cacheStore.get(key)
  if (!hit) return null
  if (Date.now() > hit.expires) {
    cacheStore.delete(key)
    return null
  }
  return hit.value as T
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  cacheStore.set(key, { value, expires: Date.now() + ttlMs })
  // Soft cap
  if (cacheStore.size > 500) {
    const first = cacheStore.keys().next().value
    if (first) cacheStore.delete(first)
  }
}

// ── Canonical local-delivery quote (shared by fee endpoint + fulfillment) ────

const GEO_CACHE_TTL_MS = 15 * 60 * 1000

export type GeoPoint = { lat: number; lng: number }

export type DeliveryQuoteStore = {
  id: string
  name: string
  latitude: number | null | undefined
  longitude: number | null | undefined
  metadata?: Record<string, unknown> | null
}

export type QuoteLocalDeliveryError =
  | "missing_coords"
  | "missing_destination"
  | "unresolvable_postcode"
  | "outside_radius"

export type QuoteLocalDeliveryResult = {
  deliverable: boolean
  fee: number
  distance_km: number | null
  duration_minutes: number | null
  max_radius_km: number
  source: "google" | "haversine" | null
  error?: QuoteLocalDeliveryError
  message?: string
}

export type QuoteLocalDeliveryInput = {
  store: DeliveryQuoteStore
  /** Destination coordinates when already known (skips geocoding). */
  dest?: GeoPoint | null
  /** UK postcode — used when `dest` is not provided. */
  postcode?: string | null
  config?: DeliveryFeeConfig
  /** Test / DI hooks — production callers leave these unset. */
  geocode?: (postcode: string) => Promise<GeoPoint | null>
  drivingDistance?: (
    origin: GeoPoint,
    dest: GeoPoint
  ) => Promise<{ km: number; minutes: number } | null>
}

/** Round distance to 2dp — single policy for quote and charge paths. */
export function roundDistanceKm(distanceKm: number): number {
  return Math.round(distanceKm * 100) / 100
}

/**
 * Geocode a UK postcode via postcodes.io (in-process TTL cache).
 */
export async function geocodeUkPostcode(
  postcode: string
): Promise<GeoPoint | null> {
  const normalised = postcode.trim()
  if (!normalised) return null

  const key = `geo:pc:${normalised.toUpperCase().replace(/\s+/g, "")}`
  const cached = cacheGet<GeoPoint>(key)
  if (cached) return cached

  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(normalised)}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const json = (await res.json()) as {
      result?: { latitude?: number; longitude?: number }
    }
    if (json.result?.latitude == null || json.result?.longitude == null) {
      return null
    }
    const point: GeoPoint = {
      lat: Number(json.result.latitude),
      lng: Number(json.result.longitude),
    }
    cacheSet(key, point, GEO_CACHE_TTL_MS)
    return point
  } catch {
    return null
  }
}

/**
 * Google Distance Matrix driving distance when `GOOGLE_MAPS_API_KEY` is set.
 * Returns null when the key is absent or the request fails.
 */
export async function googleDrivingDistanceKm(
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
    cacheSet(cacheKey, result, GEO_CACHE_TTL_MS)
    return result
  } catch {
    return null
  }
}

/**
 * Canonical local-delivery quote used by:
 *   - GET /store/stores/:id/delivery-fee
 *   - CakeFulfillmentProviderService.calculatePrice
 *
 * Pure domain orchestration — no DI, no DB access.
 * Callers load the store and decide how soft vs hard failures map to HTTP/Medusa errors.
 */
export async function quoteLocalDelivery(
  input: QuoteLocalDeliveryInput
): Promise<QuoteLocalDeliveryResult> {
  const cfg = input.config ?? DEFAULT_DELIVERY_FEE_CONFIG
  const store = input.store
  const radiusKm =
    Number(store.metadata?.delivery_radius_km) || cfg.defaultRadiusKm

  if (store.latitude == null || store.longitude == null) {
    return {
      deliverable: false,
      fee: 0,
      distance_km: null,
      duration_minutes: null,
      max_radius_km: radiusKm,
      source: null,
      error: "missing_coords",
      message: "This bakery has no map coordinates configured for delivery.",
    }
  }

  const origin: GeoPoint = {
    lat: Number(store.latitude),
    lng: Number(store.longitude),
  }

  let dest: GeoPoint | null =
    input.dest &&
    Number.isFinite(input.dest.lat) &&
    Number.isFinite(input.dest.lng)
      ? { lat: Number(input.dest.lat), lng: Number(input.dest.lng) }
      : null

  if (!dest) {
    const postcode = input.postcode?.trim() ?? ""
    if (!postcode) {
      return {
        deliverable: false,
        fee: 0,
        distance_km: null,
        duration_minutes: null,
        max_radius_km: radiusKm,
        source: null,
        error: "missing_destination",
        message: "Provide dest_lat & dest_lng, or a UK postcode",
      }
    }
    const geocode = input.geocode ?? geocodeUkPostcode
    dest = await geocode(postcode)
    if (!dest) {
      return {
        deliverable: false,
        fee: 0,
        distance_km: null,
        duration_minutes: null,
        max_radius_km: radiusKm,
        source: null,
        error: "unresolvable_postcode",
        message: "Could not resolve that postcode. Please check and try again.",
      }
    }
  }

  let distanceKm: number
  let durationMinutes: number | null = null
  let source: "google" | "haversine" = "haversine"

  const drivingDistance = input.drivingDistance ?? googleDrivingDistanceKm
  const google = await drivingDistance(origin, dest)
  if (google) {
    distanceKm = google.km
    durationMinutes = google.minutes
    source = "google"
  } else {
    distanceKm =
      haversineKm(origin.lat, origin.lng, dest.lat, dest.lng) * cfg.roadFactor
  }

  // Single rounding policy for quote and charge (prevents penny splits).
  distanceKm = roundDistanceKm(distanceKm)

  if (distanceKm > radiusKm) {
    return {
      deliverable: false,
      fee: 0,
      distance_km: distanceKm,
      duration_minutes: durationMinutes,
      max_radius_km: radiusKm,
      source,
      error: "outside_radius",
      message: `Sorry — this address is outside the ${radiusKm} km delivery radius for ${store.name}.`,
    }
  }

  const fee = computeDeliveryFee(distanceKm, cfg)

  return {
    deliverable: true,
    fee,
    distance_km: distanceKm,
    duration_minutes: durationMinutes,
    max_radius_km: radiusKm,
    source,
  }
}
