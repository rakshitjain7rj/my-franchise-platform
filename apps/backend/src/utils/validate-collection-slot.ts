/**
 * Server-side collection window validation against kitchen lead time,
 * opening-hours grid, and per-slot capacity.
 *
 * Enforces:
 *  1. Collection date + time present (cart metadata or line attributes)
 *  2. Store is open / accepting orders
 *  3. Slot start is at least `custom_lead_time_hours` after now (busy mode)
 *     — with a small grace for PayPal redirect latency
 *  4. Time matches a generated 30-minute opening-hours slot
 *  5. Slot still has remaining capacity (when usage is provided)
 */

import { MedusaError } from "@medusajs/framework/utils"
import {
  applySlotUsage,
  buildDaySlots,
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

export type AssertCollectionSlotOptions = {
  now?: Date
  /**
   * When true, lead-time rejection uses kitchen-busy customer copy.
   * Must come from franchise ops settings — never inferred from lead hours alone.
   */
  kitchenBusy?: boolean
  /**
   * Existing bookings for this store on the requested date (slot start → count).
   * When omitted, capacity is not re-checked (lead + grid still are).
   */
  usageBySlotStart?: Map<string, number> | Record<string, number>
  /**
   * When false, skip the opening-hours grid membership check.
   * Default true.
   */
  requireGridSlot?: boolean
  /**
   * When false, skip capacity re-check even if usage is provided.
   * Default true when usage is provided.
   */
  requireCapacity?: boolean
}

/**
 * Throws MedusaError when the requested collection window violates kitchen
 * lead time, store open status, grid membership, or (when usage is provided)
 * remaining capacity.
 */
export function assertCollectionSlotAllowed(
  location: StoreLocationForSlot,
  request: CollectionSlotRequest,
  nowOrOptions: Date | AssertCollectionSlotOptions = new Date()
): void {
  const options: AssertCollectionSlotOptions =
    nowOrOptions instanceof Date ? { now: nowOrOptions } : nowOrOptions ?? {}
  const now = options.now ?? new Date()
  const kitchenBusy = Boolean(options.kitchenBusy)
  const requireGridSlot = options.requireGridSlot !== false
  const requireCapacity = options.requireCapacity !== false

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
  // reject a slot that was valid when the shopper paid. Applies to lead only.
  const graceMs = 2 * 60 * 1000
  const cutoffMs = now.getTime() + leadTimeHours * 60 * 60 * 1000 - graceMs

  if (slotStart.getTime() < cutoffMs) {
    const hoursLabel =
      leadTimeHours === 1
        ? "1 hour"
        : leadTimeHours < 1
          ? "a short preparation window"
          : `${leadTimeHours} hours`
    if (leadTimeHours > 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        kitchenBusy
          ? `Kitchen is busy — orders need at least ${hoursLabel} notice. Please choose a later collection slot.`
          : `This bakery needs at least ${hoursLabel} notice. Please choose a later collection slot.`
      )
    }
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "The selected collection slot is no longer available. Please choose another time."
    )
  }

  if (!requireGridSlot && !options.usageBySlotStart) {
    return
  }

  // Grid + capacity use the same generator as GET /store/stores/:id/slots
  // so complete cannot accept times the picker never offered.
  const slots = buildDaySlots({
    date,
    openingHours: location.opening_hours,
    capacityPerSlot: location.daily_order_capacity ?? 10,
    leadTimeHours,
    now,
    metadata: location.metadata,
  })

  if (options.usageBySlotStart) {
    applySlotUsage(slots, options.usageBySlotStart)
  }

  const match = slots.find((s) => s.time === time)
  if (requireGridSlot && !match) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The selected collection time is not a valid slot for this bakery. Please choose the slot again."
    )
  }

  if (
    requireCapacity &&
    options.usageBySlotStart &&
    match &&
    match.available_capacity <= 0
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This collection slot is full. Please choose another time."
    )
  }
}
