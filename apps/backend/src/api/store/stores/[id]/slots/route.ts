/**
 * GET /store/stores/:id/slots?date=YYYY-MM-DD
 *
 * 30-minute pickup/delivery slots for a StoreLocation.
 * Capacity = daily_order_capacity per slot (NOT per day).
 * Bookings counted only for orders linked to this store via
 * order-store-location (tenant-safe — never id:[]).
 *
 * Response:
 * {
 *   date, store_location_id, lead_time_hours, kitchen_busy,
 *   slots: [{ time, end, label, available_capacity, is_bookable, unbookable_reason? }]
 * }
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import OrderStoreLocationLink from "../../../../../links/order-store-location"
import {
  applySlotUsage,
  buildDaySlots,
  countSlotUsageForDate,
  resolveKitchenBusy,
  resolveLeadTimeHours,
  type OpeningHours,
} from "../../../../../utils/logistics"

type StoreLoc = {
  id: string
  name: string
  franchise_id: string
  opening_hours: OpeningHours | null
  daily_order_capacity: number
  custom_lead_time_hours: number
  is_active: boolean
  is_accepting_orders?: boolean
  metadata: Record<string, unknown> | null
}

type FranchiseRow = {
  id: string
  metadata?: Record<string, unknown> | null
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

  const rawDate = String(
    (req.query as Record<string, string>)?.date ?? ""
  ).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Query parameter 'date' is required (YYYY-MM-DD)"
    )
  }

  const franchiseService = req.scope.resolve("franchise") as {
    listStoreLocations: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<StoreLoc[]>
    listFranchises: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<FranchiseRow[]>
  }

  const [location] = await franchiseService.listStoreLocations(
    { id: storeId },
    {
      select: [
        "id",
        "name",
        "franchise_id",
        "opening_hours",
        "daily_order_capacity",
        "custom_lead_time_hours",
        "is_active",
        "is_accepting_orders",
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

  // 0 is a valid "immediate" lead time — do not treat it as falsy / fall back to 24.
  const leadTimeHours = resolveLeadTimeHours(location)

  // Kitchen Busy comes from franchise ops settings (not inferred from lead hours).
  let kitchenBusy = false
  try {
    const [franchise] = await franchiseService.listFranchises(
      { id: location.franchise_id },
      { select: ["id", "metadata"] }
    )
    kitchenBusy = resolveKitchenBusy(franchise?.metadata)
  } catch {
    kitchenBusy = false
  }

  // Optional franchise header guard — if present, store must belong to it
  const headerFranchise =
    typeof req.headers["x-franchise-id"] === "string"
      ? req.headers["x-franchise-id"].trim()
      : ""
  if (headerFranchise && location.franchise_id !== headerFranchise) {
    res.status(200).json({
      date: rawDate,
      store_location_id: storeId,
      lead_time_hours: leadTimeHours,
      kitchen_busy: kitchenBusy,
      slots: [],
      message:
        "This bakery does not belong to the active franchise. Pick a store from the map and try again.",
    })
    return
  }

  if (location.is_accepting_orders === false) {
    res.status(200).json({
      date: rawDate,
      store_location_id: storeId,
      lead_time_hours: leadTimeHours,
      kitchen_busy: kitchenBusy,
      slots: [],
      message: "This bakery is not accepting orders right now.",
    })
    return
  }

  const slots = buildDaySlots({
    date: rawDate,
    openingHours: location.opening_hours,
    capacityPerSlot: location.daily_order_capacity ?? 10,
    leadTimeHours,
    // Seeded stores often only have metadata.store_hours; resolveOpeningHours
    // inside buildDaySlots expands that (or defaults) when opening_hours is null.
    metadata: location.metadata,
  })

  if (!slots.length) {
    res.status(200).json({
      date: rawDate,
      store_location_id: storeId,
      lead_time_hours: leadTimeHours,
      kitchen_busy: kitchenBusy,
      slots: [],
      message: "Closed on this date.",
    })
    return
  }

  // ── Count orders booked at THIS store only ────────────────────────────────
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: linkRows } = await query.graph({
      entity: OrderStoreLocationLink.entryPoint,
      fields: ["order.metadata", "order.id"],
      filters: { store_location_id: storeId },
    })

    const metas = (
      linkRows as Array<{ order?: { metadata?: Record<string, unknown> | null } }>
    ).map((row) => row.order?.metadata ?? null)
    const usage = countSlotUsageForDate(metas, rawDate)
    applySlotUsage(slots, usage)
  } catch {
    // Best-effort capacity — still return generated slots
  }

  const anyBookable = slots.some((s) => s.is_bookable)
  res.status(200).json({
    date: rawDate,
    store_location_id: storeId,
    lead_time_hours: leadTimeHours,
    kitchen_busy: kitchenBusy,
    slots,
    ...(anyBookable
      ? {}
      : {
          message: kitchenBusy
            ? `Kitchen is busy — orders need at least ${leadTimeHours} hour${
                leadTimeHours === 1 ? "" : "s"
              } notice. Please choose a later date or time.`
            : leadTimeHours > 0
              ? `Orders need at least ${leadTimeHours} hour${
                  leadTimeHours === 1 ? "" : "s"
                } notice. Please choose a later date or time.`
              : "No bookable slots on this date.",
        }),
  })
}
