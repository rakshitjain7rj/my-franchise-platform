/**
 * Logistics helpers for time-slot generation and delivery-fee maths.
 * Money is always GBP **major units** (never pence).
 */

export type DayHours = { open: string; close: string }
export type OpeningHours = Record<string, DayHours>

/** Why a generated slot cannot be booked (omitted / null when bookable). */
export type UnbookableReason = "lead_time" | "capacity"

export type TimeSlot = {
  /** Slot start "HH:mm" (24h) */
  time: string
  /** Slot end "HH:mm" */
  end: string
  /** Human label e.g. "09:00 – 09:30" */
  label: string
  available_capacity: number
  is_bookable: boolean
  /**
   * Present when `is_bookable` is false.
   * - lead_time: start is before now + lead hours
   * - capacity: remaining capacity is 0
   * Lead-time takes priority over capacity when both apply.
   */
  unbookable_reason?: UnbookableReason | null
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

/**
 * Default bakery hours when a store has no opening_hours configured.
 * Open times match Cake Break collection policy (see collectionEarliestOpen).
 */
export const DEFAULT_OPENING_HOURS: OpeningHours = {
  monday: { open: "11:00", close: "18:00" },
  tuesday: { open: "10:00", close: "18:00" },
  wednesday: { open: "10:00", close: "18:00" },
  thursday: { open: "10:00", close: "18:00" },
  friday: { open: "10:00", close: "18:00" },
  saturday: { open: "10:00", close: "18:00" },
  sunday: { open: "11:00", close: "18:00" },
}

/**
 * Earliest collection slot customers may book (policy), even if the shop
 * open time in admin is earlier.
 * - Monday & Sunday → 11:00
 * - Tuesday–Saturday → 10:00
 */
export const COLLECTION_EARLIEST_WEEKDAY = "10:00"
export const COLLECTION_EARLIEST_MONDAY_SUNDAY = "11:00"

export function collectionEarliestOpen(weekday: string): string {
  const d = weekday.trim().toLowerCase()
  if (d === "monday" || d === "sunday") {
    return COLLECTION_EARLIEST_MONDAY_SUNDAY
  }
  return COLLECTION_EARLIEST_WEEKDAY
}

/**
 * Resolve customer-facing lead time (hours) for a store location.
 *
 * Important: `0` means immediate / no minimum notice. Do not use `|| 24`
 * because that treats 0 as missing and incorrectly forces a day of lead time.
 *
 * Priority: custom_lead_time_hours → metadata.lead_time_hours → 0 (same-day).
 * Kitchen-busy mode is the ops lever for temporary longer notice — not a
 * permanent 24h default that loses same-day customers.
 */
export function resolveLeadTimeHours(location: {
  custom_lead_time_hours?: number | null
  metadata?: Record<string, unknown> | null
}): number {
  const raw = location.custom_lead_time_hours
  if (raw !== null && raw !== undefined && Number.isFinite(Number(raw))) {
    return Math.max(0, Number(raw))
  }
  const meta = Number(location.metadata?.lead_time_hours)
  if (Number.isFinite(meta)) {
    return Math.max(0, meta)
  }
  return 0
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

  // Cake Break policy: no collection before 10:00 (11:00 Mon/Sun), even if
  // the store open time is earlier in admin (e.g. 08:00).
  const policyMin = parseHHMM(collectionEarliestOpen(weekday)) ?? openMin
  const effectiveOpen = Math.max(openMin, policyMin)
  if (closeMin <= effectiveOpen) return []

  const capacity = Math.max(0, Math.floor(capacityPerSlot) || 0)
  const cutoffMs = now.getTime() + Math.max(0, leadTimeHours) * 60 * 60 * 1000

  const slots: TimeSlot[] = []
  for (let cursor = effectiveOpen; cursor + 30 <= closeMin; cursor += 30) {
    const time = formatHHMM(cursor)
    const end = formatHHMM(cursor + 30)
    const slotStart = new Date(`${date}T${time}:00`)
    const blockedByLead = slotStart.getTime() < cutoffMs
    const blockedByCapacity = capacity <= 0

    let unbookable_reason: UnbookableReason | null = null
    if (blockedByLead) unbookable_reason = "lead_time"
    else if (blockedByCapacity) unbookable_reason = "capacity"

    slots.push({
      time,
      end,
      label: `${time} – ${end}`,
      available_capacity: capacity,
      is_bookable: !blockedByLead && !blockedByCapacity,
      unbookable_reason,
    })
  }
  return slots
}

/**
 * Subtract existing bookings from generated slots (one order = one capacity unit).
 * Slots already blocked by lead-time stay unbookable even if capacity remains.
 * Mutates and returns the same array for route convenience.
 */
export function applySlotUsage(
  slots: TimeSlot[],
  usageBySlotStart: Map<string, number> | Record<string, number>
): TimeSlot[] {
  const getUsed = (time: string): number => {
    if (usageBySlotStart instanceof Map) {
      return usageBySlotStart.get(time) ?? 0
    }
    return usageBySlotStart[time] ?? 0
  }

  for (const slot of slots) {
    const used = Math.max(0, Math.floor(getUsed(slot.time)) || 0)
    slot.available_capacity = Math.max(0, slot.available_capacity - used)
    if (slot.available_capacity <= 0) {
      slot.available_capacity = 0
      slot.is_bookable = false
      // Lead-time blocks take priority over capacity for customer messaging.
      if (slot.unbookable_reason !== "lead_time") {
        slot.unbookable_reason = "capacity"
      }
    }
  }
  return slots
}

/**
 * Count bookings per slot start ("HH:mm") for a single calendar day from
 * order metadata rows (cart/order `requested_pickup_*` fields).
 */
export function countSlotUsageForDate(
  ordersMeta: Array<Record<string, unknown> | null | undefined>,
  date: string
): Map<string, number> {
  const usage = new Map<string, number>()
  for (const meta of ordersMeta) {
    if (!meta) continue
    const dateKey =
      typeof meta.requested_pickup_date === "string"
        ? meta.requested_pickup_date
        : null
    const timeRaw =
      typeof meta.requested_pickup_time === "string"
        ? meta.requested_pickup_time
        : null

    let slotStart: string | null = null
    if (dateKey === date && timeRaw) {
      slotStart = extractSlotStart(timeRaw, date)
    } else if (timeRaw && (timeRaw.includes("T") || timeRaw.includes("-"))) {
      slotStart = extractSlotStart(timeRaw, date)
    }
    if (!slotStart) continue
    usage.set(slotStart, (usage.get(slotStart) ?? 0) + 1)
  }
  return usage
}

/** Franchise ops: kitchen busy when not accepting immediate orders. */
export function resolveKitchenBusy(
  franchiseMetadata: Record<string, unknown> | null | undefined
): boolean {
  const raw = franchiseMetadata?.franchise_ops_settings
  if (!raw || typeof raw !== "object") return false
  const accepting = (raw as { accepting_immediate_orders?: unknown })
    .accepting_immediate_orders
  // Default open (not busy) when the flag was never written.
  if (accepting === false) return true
  return false
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

/** Mean Earth radius in miles (WGS-84 sphere approximation). */
const EARTH_RADIUS_MI = 3958.7613
/** Metres per statute mile. */
const METRES_PER_MILE = 1609.344

/**
 * Great-circle distance in miles between two WGS-84 points.
 */
export function haversineMi(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** @deprecated Prefer haversineMi — kept for any residual km callers. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return haversineMi(lat1, lon1, lat2, lon2) * (1609.344 / 1000)
}

export type DeliveryFeeConfig = {
  /** First N miles free (default 1). */
  freeMiles: number
  /** GBP major units charged per mile after free band (default 4.49). */
  perMileGbp: number
  /** Road-distance multiplier when using straight-line haversine. */
  roadFactor: number
  /** Max deliverable radius in miles (default 10). */
  defaultRadiusMi: number
  /**
   * Merchandise subtotal (after discounts, before tax & delivery) at/above
   * which delivery is free within the radius (default 150).
   */
  freeOverGbp: number
}

export const DEFAULT_DELIVERY_FEE_CONFIG: DeliveryFeeConfig = {
  freeMiles: Number(process.env.DELIVERY_FREE_MILES ?? 1),
  perMileGbp: Number(process.env.DELIVERY_PER_MILE ?? 4.49),
  roadFactor: Number(process.env.DELIVERY_ROAD_FACTOR ?? 1.3),
  defaultRadiusMi: Number(process.env.DELIVERY_DEFAULT_RADIUS_MI ?? 10),
  freeOverGbp: Number(process.env.DELIVERY_FREE_OVER_GBP ?? 150),
}

/**
 * Compute delivery fee in GBP major units from driving distance in miles.
 * Optional merchandise subtotal enables free delivery at/above freeOverGbp.
 * No base fee and no max-fee cap.
 */
export function computeDeliveryFee(
  distanceMi: number,
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_FEE_CONFIG,
  merchandiseSubtotal?: number | null
): number {
  if (distanceMi < 0 || !Number.isFinite(distanceMi)) return 0
  if (
    merchandiseSubtotal != null &&
    Number.isFinite(merchandiseSubtotal) &&
    merchandiseSubtotal >= config.freeOverGbp
  ) {
    return 0
  }
  if (distanceMi <= config.freeMiles) return 0
  const chargeable = Math.max(0, distanceMi - config.freeMiles)
  const raw = chargeable * config.perMileGbp
  // Round to nearest 0.01 (major units)
  return Math.round(raw * 100) / 100
}

/**
 * GBP still needed to unlock free delivery by order value.
 * Returns 0 when already at/above the threshold.
 */
export function amountToFreeDelivery(
  merchandiseSubtotal: number,
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_FEE_CONFIG
): number {
  if (!Number.isFinite(merchandiseSubtotal)) return config.freeOverGbp
  return Math.max(0, Math.round((config.freeOverGbp - merchandiseSubtotal) * 100) / 100)
}

function asFiniteMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export type MerchandiseSubtotalSources = {
  /** Line items (preferred — excludes shipping & tax). */
  items?: Array<Record<string, unknown>> | null
  /**
   * Pre-tax item subtotal before line discounts (Medusa `item_subtotal`).
   * Prefer with `item_discount_total` when lines are incomplete.
   */
  item_subtotal?: unknown
  /** Pre-tax discounts on items only (Medusa `item_discount_total`). */
  item_discount_total?: unknown
  /**
   * Cart `subtotal` may include shipping after a method is attached — never
   * use alone. Only used as last resort after stripping shipping.
   */
  subtotal?: unknown
  shipping_subtotal?: unknown
  shipping_total?: unknown
  /** Cart-level discount total (items + possibly shipping). */
  discount_total?: unknown
  /**
   * Do not use `item_total` for free-over — it is tax-inclusive.
   * Listed here only so callers do not pass it by mistake via rest spreads.
   */
  item_total?: unknown
}

/**
 * Merchandise after discounts, before tax & delivery (GBP major units).
 *
 * Free-over-£150 SSOT for soft quote and charge path. Never counts shipping
 * or tax. Prefer line items; fall back to item_subtotal; last resort strips
 * shipping from cart.subtotal.
 *
 * Returns `undefined` when nothing usable is found (distance-only pricing).
 */
export function merchandiseSubtotalForDelivery(
  sources: MerchandiseSubtotalSources | null | undefined
): number | undefined {
  if (!sources) return undefined

  const items = sources.items
  if (Array.isArray(items) && items.length > 0) {
    let sum = 0
    let any = false
    for (const item of items) {
      if (!item || typeof item !== "object") continue
      const lineSub = asFiniteMoney(item.subtotal)
      const unit = asFiniteMoney(item.unit_price)
      const qty = asFiniteMoney(item.quantity) ?? 1
      let gross: number | null = lineSub
      if (gross == null && unit != null) {
        gross = unit * qty
      }
      if (gross == null) continue

      // Prefer pre-tax discount; fall back to adjustments or discount_total.
      let disc =
        asFiniteMoney(item.discount_subtotal) ??
        asFiniteMoney(item.discount_total) ??
        null
      if (disc == null && Array.isArray(item.adjustments)) {
        disc = 0
        for (const adj of item.adjustments) {
          if (!adj || typeof adj !== "object") continue
          const amt = asFiniteMoney((adj as Record<string, unknown>).amount)
          if (amt != null) disc += Math.abs(amt)
        }
      }
      sum += Math.max(0, gross - (disc ?? 0))
      any = true
    }
    if (any) return Math.round(sum * 100) / 100
  }

  const itemSub = asFiniteMoney(sources.item_subtotal)
  if (itemSub != null) {
    const itemDisc = asFiniteMoney(sources.item_discount_total) ?? 0
    return Math.max(0, Math.round((itemSub - itemDisc) * 100) / 100)
  }

  // Last resort: cart.subtotal often includes shipping after attach.
  const sub = asFiniteMoney(sources.subtotal)
  if (sub != null) {
    const ship =
      asFiniteMoney(sources.shipping_subtotal) ??
      asFiniteMoney(sources.shipping_total) ??
      0
    const disc = asFiniteMoney(sources.discount_total) ?? 0
    return Math.max(0, Math.round((sub - ship - disc) * 100) / 100)
  }

  return undefined
}

/**
 * Resolve store delivery radius in miles.
 * Prefers metadata.delivery_radius_mi; ignores legacy delivery_radius_km.
 */
export function resolveDeliveryRadiusMi(
  store: { metadata?: Record<string, unknown> | null },
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_FEE_CONFIG
): number {
  const raw = Number(store.metadata?.delivery_radius_mi)
  if (Number.isFinite(raw) && raw > 0) return raw
  return config.defaultRadiusMi
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
  distance_mi: number | null
  duration_minutes: number | null
  max_radius_mi: number
  source: "google" | "haversine" | null
  error?: QuoteLocalDeliveryError
  message?: string
  /** Present when fee > 0 and a merchandise subtotal was supplied. */
  amount_to_free_delivery?: number
}

export type QuoteLocalDeliveryInput = {
  store: DeliveryQuoteStore
  /** Destination coordinates when already known (skips geocoding). */
  dest?: GeoPoint | null
  /** UK postcode — used when `dest` is not provided. */
  postcode?: string | null
  /**
   * Merchandise subtotal after discounts, before tax & delivery (GBP major units).
   * Used for free delivery at/above freeOverGbp.
   */
  merchandise_subtotal?: number | null
  config?: DeliveryFeeConfig
  /** Test / DI hooks — production callers leave these unset. */
  geocode?: (postcode: string) => Promise<GeoPoint | null>
  drivingDistance?: (
    origin: GeoPoint,
    dest: GeoPoint
  ) => Promise<{ mi: number; minutes: number } | null>
}

/** Round distance to 2dp — single policy for quote and charge paths. */
export function roundDistanceMi(distanceMi: number): number {
  return Math.round(distanceMi * 100) / 100
}

/** @deprecated Prefer roundDistanceMi. */
export function roundDistanceKm(distanceKm: number): number {
  return roundDistanceMi(distanceKm)
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
 * Google Distance Matrix driving distance in miles when `GOOGLE_MAPS_API_KEY` is set.
 * Returns null when the key is absent or the request fails.
 */
export async function googleDrivingDistanceMi(
  origin: GeoPoint,
  dest: GeoPoint
): Promise<{ mi: number; minutes: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim()
  if (!apiKey) return null

  const cacheKey = `gdm:mi:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}>${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`
  const cached = cacheGet<{ mi: number; minutes: number }>(cacheKey)
  if (cached) return cached

  try {
    const url = new URL(
      "https://maps.googleapis.com/maps/api/distancematrix/json"
    )
    url.searchParams.set("origins", `${origin.lat},${origin.lng}`)
    url.searchParams.set("destinations", `${dest.lat},${dest.lng}`)
    // Distance value is always metres; convert to miles ourselves for SSOT.
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
      mi: el.distance.value / METRES_PER_MILE,
      minutes: Math.round((el.duration?.value ?? 0) / 60),
    }
    cacheSet(cacheKey, result, GEO_CACHE_TTL_MS)
    return result
  } catch {
    return null
  }
}

/** @deprecated Prefer googleDrivingDistanceMi. */
export async function googleDrivingDistanceKm(
  origin: GeoPoint,
  dest: GeoPoint
): Promise<{ km: number; minutes: number } | null> {
  const mi = await googleDrivingDistanceMi(origin, dest)
  if (!mi) return null
  return { km: mi.mi * (METRES_PER_MILE / 1000), minutes: mi.minutes }
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
  const radiusMi = resolveDeliveryRadiusMi(store, cfg)
  const merchandiseSubtotal =
    input.merchandise_subtotal != null &&
    Number.isFinite(Number(input.merchandise_subtotal))
      ? Number(input.merchandise_subtotal)
      : null

  if (store.latitude == null || store.longitude == null) {
    return {
      deliverable: false,
      fee: 0,
      distance_mi: null,
      duration_minutes: null,
      max_radius_mi: radiusMi,
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
        distance_mi: null,
        duration_minutes: null,
        max_radius_mi: radiusMi,
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
        distance_mi: null,
        duration_minutes: null,
        max_radius_mi: radiusMi,
        source: null,
        error: "unresolvable_postcode",
        message: "Could not resolve that postcode. Please check and try again.",
      }
    }
  }

  let distanceMi: number
  let durationMinutes: number | null = null
  let source: "google" | "haversine" = "haversine"

  const drivingDistance = input.drivingDistance ?? googleDrivingDistanceMi
  const google = await drivingDistance(origin, dest)
  if (google) {
    distanceMi = google.mi
    durationMinutes = google.minutes
    source = "google"
  } else {
    distanceMi =
      haversineMi(origin.lat, origin.lng, dest.lat, dest.lng) * cfg.roadFactor
  }

  // Single rounding policy for quote and charge (prevents penny splits).
  distanceMi = roundDistanceMi(distanceMi)

  if (distanceMi > radiusMi) {
    return {
      deliverable: false,
      fee: 0,
      distance_mi: distanceMi,
      duration_minutes: durationMinutes,
      max_radius_mi: radiusMi,
      source,
      error: "outside_radius",
      message: `Sorry — this address is outside the ${radiusMi} mile delivery radius for ${store.name}.`,
    }
  }

  const fee = computeDeliveryFee(distanceMi, cfg, merchandiseSubtotal)

  const result: QuoteLocalDeliveryResult = {
    deliverable: true,
    fee,
    distance_mi: distanceMi,
    duration_minutes: durationMinutes,
    max_radius_mi: radiusMi,
    source,
  }

  if (fee > 0 && merchandiseSubtotal != null) {
    result.amount_to_free_delivery = amountToFreeDelivery(
      merchandiseSubtotal,
      cfg
    )
  }

  return result
}
