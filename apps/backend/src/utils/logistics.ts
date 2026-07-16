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
