/**
 * Server-side collection / delivery window validation against kitchen lead time.
 *
 * Slot listing is advisory for the storefront. Checkout must re-check that the
 * cart's requested_pickup_* is still bookable so busy mode + lead hours cannot
 * be bypassed by crafting cart metadata.
 */

import { MedusaError } from "@medusajs/framework/utils"
import {
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

/**
 * Throws MedusaError when the requested collection window violates kitchen
 * lead time, store open status, or is not a bookable 30-min slot.
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
    (typeof request.date === "string" && request.date.trim()) ||
    (typeof request.iso === "string" && request.iso.includes("T")
      ? request.iso.split("T")[0]
      : "")

  let time =
    (typeof request.time === "string" && extractSlotStart(request.time)) ||
    (typeof request.label === "string" && extractSlotStart(request.label)) ||
    ""

  if (!time && typeof request.iso === "string" && request.iso.includes("T")) {
    const raw = request.iso.split("T")[1] ?? ""
    time = extractSlotStart(raw.slice(0, 5)) || ""
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A collection date is required before placing the order."
    )
  }

  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A collection time slot is required before placing the order."
    )
  }

  const leadTimeHours = resolveLeadTimeHours(location)
  const slots = buildDaySlots({
    date,
    openingHours: location.opening_hours,
    capacityPerSlot: location.daily_order_capacity ?? 10,
    leadTimeHours,
    now,
    metadata: location.metadata,
  })

  const match = slots.find((s) => s.time === time)
  if (!match) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `The selected time ${time} is not a valid slot for ${date}. Please choose another collection window.`
    )
  }

  if (!match.is_bookable) {
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
