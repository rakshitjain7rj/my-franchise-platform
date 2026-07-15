/**
 * Client helpers for store logistics: time slots + delivery fee.
 */

import { getMedusaHeadersSync } from "@/lib/medusa/headers"

const BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ??
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ??
  "http://localhost:9000"

export type StoreTimeSlot = {
  time: string
  end: string
  label: string
  available_capacity: number
  is_bookable: boolean
}

export type SlotsResponse = {
  date: string
  store_location_id?: string
  lead_time_hours?: number
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

/** Min selectable date as YYYY-MM-DD (tomorrow local). */
export function defaultMinCollectionDate(leadTimeHours = 24): string {
  const d = new Date()
  d.setTime(d.getTime() + Math.max(leadTimeHours, 24) * 60 * 60 * 1000)
  // At least tomorrow calendar day for cake lead times
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const target = d > tomorrow ? d : tomorrow
  const yyyy = target.getFullYear()
  const mm = String(target.getMonth() + 1).padStart(2, "0")
  const dd = String(target.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}
