/**
 * Server-side collection window validation against kitchen lead time.
 *
 * Enforces:
 *  1. Collection date + time present (cart metadata or line attributes)
 *  2. Store is open / accepting orders
 *  3. Slot start is at least `custom_lead_time_hours` after now (busy mode)
 *
 * Does NOT require the time to appear in the generated slot grid — that list
 * can disagree with shopper clocks (server TZ vs UK local) and was rejecting
 * legitimate out-of-lead-time PayPal returns.
 */

import { MedusaError } from "@medusajs/framework/utils"
import {
  extractSlotStart,
  resolveLeadTimeHours,
  type OpeningHours,
} from "./logistics"

export type StoreLocationForSlot = {
  id: string
  name?: string | null
  is_active?: boolean | null
  is_accepting_orders?: boolean | null
  custom_lead_time_hours?: number | null
  opening_hours?: OpeningHours | null
  daily_order_capacity?: number | null
  metadata?: Record<string, unknown> | null
}

export type CollectionSlotRequest = {
  date?: string | null
  time?: string | null
  label?: string | null
  iso?: string | null
}

export type LineItemLike = {
  metadata?: {
    store_location_id?: string
    custom_attributes?: Record<string, unknown> | null
    [key: string]: unknown
  } | null
}

/** Pull collection fields from cart (or order) metadata. */
export function collectionRequestFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): CollectionSlotRequest {
  const meta = metadata ?? {}
  return {
    date:
      typeof meta.requested_pickup_date === "string"
        ? meta.requested_pickup_date
        : null,
    time:
      typeof meta.requested_pickup_time === "string"
        ? meta.requested_pickup_time
        : null,
    label:
      typeof meta.requested_pickup_label === "string"
        ? meta.requested_pickup_label
        : null,
    iso:
      typeof meta.requested_pickup_iso === "string"
        ? meta.requested_pickup_iso
        : null,
  }
}

/**
 * Resolve collection window from cart metadata, falling back to line-item
 * custom_attributes (product-page picker). Last line with a slot wins.
 */
export function resolveCollectionRequest(
  metadata: Record<string, unknown> | null | undefined,
  items?: LineItemLike[] | null
): CollectionSlotRequest {
  const fromMeta = collectionRequestFromMetadata(metadata)
  if (normalizeDate(fromMeta.date) && normalizeTime(fromMeta)) {
    return fromMeta
  }

  if (items?.length) {
    for (let i = items.length - 1; i >= 0; i--) {
      const attrs = items[i]?.metadata?.custom_attributes
      if (!attrs || typeof attrs !== "object") continue
      const date =
        typeof attrs.date === "string" ? attrs.date.trim() : ""
      const time =
        typeof attrs.time === "string" ? attrs.time.trim() : ""
      if (!date || !time) continue
      return {
        date,
        time,
        label: time,
        iso: null,
      }
    }
  }

  return fromMeta
}

export function resolveStoreLocationId(
  metadata: Record<string, unknown> | null | undefined,
  items?: LineItemLike[] | null,
  headerStoreId?: string | null
): string {
  const meta = metadata ?? {}
  if (typeof meta.store_location_id === "string" && meta.store_location_id) {
    return meta.store_location_id
  }
  if (headerStoreId?.trim()) return headerStoreId.trim()
  if (items?.length) {
    for (let i = items.length - 1; i >= 0; i--) {
      const id = items[i]?.metadata?.store_location_id
      if (typeof id === "string" && id) return id
    }
  }
  return ""
}

function normalizeDate(raw: string | null | undefined): string {
  if (!raw?.trim()) return ""
  const d = raw.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""
}

function normalizeTime(request: CollectionSlotRequest): string {
  let time =
    (typeof request.time === "string" && extractSlotStart(request.time)) ||
    (typeof request.label === "string" && extractSlotStart(request.label)) ||
    ""

  if (!time && typeof request.iso === "string" && request.iso.includes("T")) {
    const raw = request.iso.split("T")[1] ?? ""
    time = extractSlotStart(raw.slice(0, 5)) || ""
  }

  return time && /^\d{2}:\d{2}$/.test(time) ? time : ""
}

/**
 * Parse date+HH:mm as a wall-clock instant. Without an explicit TZ we treat
 * the string as local (same convention as buildDaySlots / cart ISO stamps).
 */
export function parseSlotStart(
  date: string,
  time: string,
  iso?: string | null
): Date | null {
  if (iso?.includes("T")) {
    const d = new Date(iso.length === 16 ? `${iso}:00` : iso)
    if (!Number.isNaN(d.getTime())) return d
  }
  const d = new Date(`${date}T${time}:00`)
  if (Number.isNaN(d.getTime())) return null
  return d
}

/**
 * Throws MedusaError when the requested collection window violates kitchen
 * lead time or store open status.
 */
export function assertCollectionSlotAllowed(
  location: StoreLocationForSlot,
  request: CollectionSlotRequest,
  now: Date = new Date()
): void {
  if (location.is_active === false) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This bakery is not currently available."
    )
  }

  if (location.is_accepting_orders === false) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This bakery is not accepting orders right now."
    )
  }

  const date =
    normalizeDate(request.date) ||
    (typeof request.iso === "string" && request.iso.includes("T")
      ? normalizeDate(request.iso.split("T")[0])
      : "")
  const time = normalizeTime(request)

  if (!date) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A collection date is required before placing the order."
    )
  }

  if (!time) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A collection time slot is required before placing the order."
    )
  }

  const slotStart = parseSlotStart(date, time, request.iso)
  if (!slotStart) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The collection date/time could not be understood. Please choose the slot again."
    )
  }

  const leadTimeHours = resolveLeadTimeHours(location)
  // 2-minute grace so clock skew / redirect latency after PayPal does not
  // reject a slot that was valid when the shopper paid.
  const graceMs = 2 * 60 * 1000
  const cutoffMs = now.getTime() + leadTimeHours * 60 * 60 * 1000 - graceMs

  if (slotStart.getTime() < cutoffMs) {
    const hoursLabel =
      leadTimeHours === 1
        ? "1 hour"
        : leadTimeHours < 1
          ? "a short preparation window"
          : `${leadTimeHours} hours`
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      leadTimeHours > 0
        ? `This bakery needs at least ${hoursLabel} notice (kitchen busy / lead time). ` +
            `Please choose a later collection slot.`
        : `The selected collection slot is no longer available. Please choose another time.`
    )
  }
}
