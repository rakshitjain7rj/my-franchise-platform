/**
 * Client helpers for store logistics: time slots + delivery fee.
 */

import { getMedusaHeadersSync } from "@/lib/medusa/headers"

const BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ??
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ??
  "http://localhost:9000"

export type UnbookableReason = "lead_time" | "capacity"

export type StoreTimeSlot = {
  time: string
  end: string
  label: string
  available_capacity: number
  is_bookable: boolean
  /** Present when is_bookable is false — lead_time | capacity */
  unbookable_reason?: UnbookableReason | null
}

export type SlotsResponse = {
  date: string
  store_location_id?: string
  lead_time_hours?: number
  /**
   * Explicit kitchen-busy flag from franchise ops settings.
   * Do not infer from lead_time_hours alone.
   */
  kitchen_busy?: boolean
  slots: StoreTimeSlot[]
  message?: string
}

export type DeliveryFeeResponse = {
  deliverable: boolean
  distance_km?: number
  duration_minutes?: number | null
  fee: number
  currency_code: string
  max_radius_km?: number
  source?: "google" | "haversine"
  message?: string
  store_location_id?: string
}

export async function fetchStoreSlots(
  storeLocationId: string,
  date: string
): Promise<SlotsResponse> {
  const headers = getMedusaHeadersSync()
  const url = `${BACKEND_URL}/store/stores/${encodeURIComponent(
    storeLocationId
  )}/slots?date=${encodeURIComponent(date)}`

  const res = await fetch(url, { headers, cache: "no-store" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { message?: string }).message ??
        `Could not load time slots (${res.status})`
    )
  }
  return res.json() as Promise<SlotsResponse>
}

export async function fetchDeliveryFee(
  storeLocationId: string,
  dest:
    | { postcode: string }
    | { dest_lat: number; dest_lng: number }
): Promise<DeliveryFeeResponse> {
  const headers = getMedusaHeadersSync()
  const params = new URLSearchParams()
  if ("postcode" in dest) {
    params.set("postcode", dest.postcode)
  } else {
    params.set("dest_lat", String(dest.dest_lat))
    params.set("dest_lng", String(dest.dest_lng))
  }

  const url = `${BACKEND_URL}/store/stores/${encodeURIComponent(
    storeLocationId
  )}/delivery-fee?${params.toString()}`

  const res = await fetch(url, { headers, cache: "no-store" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { message?: string }).message ??
        `Could not calculate delivery fee (${res.status})`
    )
  }
  return res.json() as Promise<DeliveryFeeResponse>
}

/** Today's local calendar date as YYYY-MM-DD (date input min — no past days). */
export function todayCollectionDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Earliest calendar day that can still have a bookable slot given kitchen lead
 * time (hours). Lead 0 → today. Lead 24 → roughly tomorrow.
 * Prefer for messaging / first-bookable hints — the date picker min is today
 * so shoppers can open lead-blocked days and see disabled slots.
 */
export function defaultMinCollectionDate(leadTimeHours = 24): string {
  const hours = Math.max(0, Number(leadTimeHours) || 0)
  const cutoff = new Date(Date.now() + hours * 60 * 60 * 1000)
  const yyyy = cutoff.getFullYear()
  const mm = String(cutoff.getMonth() + 1).padStart(2, "0")
  const dd = String(cutoff.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

/** Customer-facing reason for a non-bookable slot. */
export function slotUnbookableLabel(
  slot: StoreTimeSlot,
  opts: { leadHours: number; kitchenBusy?: boolean }
): string {
  if (slot.is_bookable) return ""

  if (
    slot.unbookable_reason === "capacity" ||
    (slot.unbookable_reason !== "lead_time" && slot.available_capacity <= 0)
  ) {
    return "This slot is full"
  }

  const h = opts.leadHours
  const hoursLabel = h === 1 ? "1 hour" : `${Math.max(0, h)} hours`
  if (opts.kitchenBusy) {
    return `Kitchen is busy — needs ${hoursLabel} notice`
  }
  if (h > 0) return `Needs at least ${hoursLabel} notice`
  return "No longer available"
}

/**
 * Persistent collection banner when kitchen is busy or normal lead applies.
 */
export function collectionLeadBanner(opts: {
  leadHours: number
  kitchenBusy?: boolean
}): string | null {
  const h = Math.max(0, Number(opts.leadHours) || 0)
  if (opts.kitchenBusy) {
    const hoursLabel = h === 1 ? "1 hour" : h > 0 ? `${h} hours` : "extra"
    return `Kitchen is busy — orders need at least ${hoursLabel} notice. Please choose a later time.`
  }
  if (h > 0) {
    const hoursLabel = h === 1 ? "1 hour" : `${h} hours`
    return `Orders need at least ${hoursLabel} notice. Slots update with live bakery capacity.`
  }
  return null
}
