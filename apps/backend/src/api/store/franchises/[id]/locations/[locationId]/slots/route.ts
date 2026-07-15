/**
 * GET /store/franchises/:id/locations/:locationId/slots?date=YYYY-MM-DD
 *
 * Thin wrapper over the canonical store-scoped slots endpoint logic.
 * Prefer GET /store/stores/:locationId/slots for new clients.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import OrderStoreLocationLink from "../../../../../../../links/order-store-location"
import {
  buildDaySlots,
  extractSlotStart,
  type OpeningHours,
} from "../../../../../../../utils/logistics"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id: franchiseId, locationId } = req.params as {
    id: string
    locationId: string
  }

  const rawDate = String(
    (req.query as Record<string, string>)?.date ?? ""
  ).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Query parameter 'date' is required (format: YYYY-MM-DD)"
    )
  }

  const franchiseService = req.scope.resolve("franchise") as {
    listStoreLocations: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        id: string
        opening_hours: OpeningHours | null
        daily_order_capacity: number
        custom_lead_time_hours?: number
        is_active?: boolean
        metadata: Record<string, unknown> | null
        franchise_id: string
      }>
    >
  }

  const [location] = await franchiseService.listStoreLocations(
    { id: locationId, franchise_id: franchiseId },
    {
      select: [
        "id",
        "opening_hours",
        "daily_order_capacity",
        "custom_lead_time_hours",
        "is_active",
        "metadata",
        "franchise_id",
      ],
    }
  )

  if (!location) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `StoreLocation ${locationId} not found for franchise ${franchiseId}`
    )
  }

  const leadTimeHours =
    Number(location.custom_lead_time_hours) ||
    Number(location.metadata?.lead_time_hours) ||
    24

  const slots = buildDaySlots({
    date: rawDate,
    openingHours: location.opening_hours,
    capacityPerSlot: location.daily_order_capacity ?? 10,
    leadTimeHours,
    metadata: location.metadata,
  })

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: linkRows } = await query.graph({
      entity: OrderStoreLocationLink.entryPoint,
      fields: ["order.metadata"],
      filters: { store_location_id: locationId },
    })

    const usage = new Map<string, number>()
    for (const row of linkRows as Array<{
      order?: { metadata?: Record<string, unknown> | null }
    }>) {
      const meta = row.order?.metadata
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
      if (dateKey === rawDate && timeRaw) {
        slotStart = extractSlotStart(timeRaw, rawDate)
      } else if (timeRaw) {
        slotStart = extractSlotStart(timeRaw, rawDate)
      }
      if (!slotStart) continue
      usage.set(slotStart, (usage.get(slotStart) ?? 0) + 1)
    }

    for (const slot of slots) {
      const used = usage.get(slot.time) ?? 0
      slot.available_capacity = Math.max(0, slot.available_capacity - used)
      if (slot.available_capacity <= 0) {
        slot.is_bookable = false
        slot.available_capacity = 0
      }
    }
  } catch {
    // best-effort
  }

  res.json({ date: rawDate, slots })
}
