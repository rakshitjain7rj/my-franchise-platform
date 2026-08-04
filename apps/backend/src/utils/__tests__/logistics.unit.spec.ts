/**
 * Unit tests for logistics helpers — slot generation, opening-hours resolution,
 * and delivery fee maths. These pin the root-cause fix for empty slots when
 * opening_hours was null (seed historically only wrote metadata.store_hours).
 */

import {
  COLLECTION_EARLIEST_MONDAY_SUNDAY,
  COLLECTION_EARLIEST_WEEKDAY,
  DEFAULT_OPENING_HOURS,
  amountToFreeDelivery,
  applySlotUsage,
  buildDaySlots,
  collectionEarliestOpen,
  computeDeliveryFee,
  expandDailyHours,
  extractSlotStart,
  formatHHMM,
  haversineMi,
  merchandiseSubtotalForDelivery,
  parseHHMM,
  quoteLocalDelivery,
  resolveLeadTimeHours,
  resolveOpeningHours,
  roundDistanceMi,
  type DeliveryFeeConfig,
} from "../logistics"

describe("resolveLeadTimeHours", () => {
  it("treats 0 as immediate (not falsy fallback)", () => {
    expect(resolveLeadTimeHours({ custom_lead_time_hours: 0 })).toBe(0)
  })

  it("uses custom lead time when set", () => {
    expect(resolveLeadTimeHours({ custom_lead_time_hours: 24 })).toBe(24)
  })

  it("falls back to metadata then 0 (same-day default)", () => {
    expect(resolveLeadTimeHours({ metadata: { lead_time_hours: 6 } })).toBe(6)
    expect(resolveLeadTimeHours({})).toBe(0)
  })
})

describe("parseHHMM / formatHHMM", () => {
  it("parses valid times", () => {
    expect(parseHHMM("09:00")).toBe(9 * 60)
    expect(parseHHMM("22:30")).toBe(22 * 60 + 30)
    expect(parseHHMM("8:00")).toBe(8 * 60)
  })

  it("rejects invalid times", () => {
    expect(parseHHMM("25:00")).toBeNull()
    expect(parseHHMM("12:60")).toBeNull()
    expect(parseHHMM("noon")).toBeNull()
  })

  it("round-trips via formatHHMM", () => {
    expect(formatHHMM(9 * 60)).toBe("09:00")
    expect(formatHHMM(22 * 60 + 30)).toBe("22:30")
  })
})

describe("resolveOpeningHours — root cause of empty slots", () => {
  it("uses native opening_hours when valid", () => {
    const native = expandDailyHours("10:00", "18:00")
    expect(resolveOpeningHours(native, null).monday).toEqual({
      open: "10:00",
      close: "18:00",
    })
  })

  it("falls back to metadata.store_hours when opening_hours is null", () => {
    const resolved = resolveOpeningHours(null, {
      store_hours: { open: "09:00", close: "17:00" },
    })
    expect(resolved.monday).toEqual({ open: "09:00", close: "17:00" })
    expect(resolved.sunday).toEqual({ open: "09:00", close: "17:00" })
  })

  it("falls back to platform default when both are missing", () => {
    expect(resolveOpeningHours(null, null)).toEqual(DEFAULT_OPENING_HOURS)
    expect(resolveOpeningHours(undefined, {})).toEqual(DEFAULT_OPENING_HOURS)
  })

  it("ignores invalid store_hours and uses default", () => {
    expect(
      resolveOpeningHours(null, { store_hours: { open: "bad", close: "xx" } })
    ).toEqual(DEFAULT_OPENING_HOURS)
  })

  it("ignores empty / invalid native opening_hours objects", () => {
    expect(resolveOpeningHours({}, null)).toEqual(DEFAULT_OPENING_HOURS)
    expect(
      resolveOpeningHours({ monday: { open: "xx", close: "yy" } }, null)
    ).toEqual(DEFAULT_OPENING_HOURS)
  })
})

describe("collectionEarliestOpen", () => {
  it("is 11:00 on Monday and Sunday, 10:00 otherwise", () => {
    expect(collectionEarliestOpen("monday")).toBe(
      COLLECTION_EARLIEST_MONDAY_SUNDAY
    )
    expect(collectionEarliestOpen("Sunday")).toBe(
      COLLECTION_EARLIEST_MONDAY_SUNDAY
    )
    expect(collectionEarliestOpen("tuesday")).toBe(COLLECTION_EARLIEST_WEEKDAY)
    expect(collectionEarliestOpen("friday")).toBe(COLLECTION_EARLIEST_WEEKDAY)
  })
})

describe("buildDaySlots", () => {
  // Fixed "now": 2026-07-10 08:00 local — lead time 0 so all open-window slots bookable
  const now = new Date("2026-07-10T08:00:00")
  // 2026-07-10 is a Friday
  const friday = "2026-07-10"
  // 2026-07-12 is a Sunday; 2026-07-13 is a Monday
  const sunday = "2026-07-12"
  const monday = "2026-07-13"

  it("generates 30-min slots from opening hours (policy earliest 10:00 on Fri)", () => {
    const slots = buildDaySlots({
      date: friday,
      openingHours: expandDailyHours("09:00", "11:00"),
      capacityPerSlot: 5,
      leadTimeHours: 0,
      now,
    })
    // Store opens 09:00 but Fri policy earliest is 10:00 → only 10:00, 10:30
    expect(slots.map((s) => s.time)).toEqual(["10:00", "10:30"])
    expect(slots.every((s) => s.available_capacity === 5)).toBe(true)
    expect(slots.every((s) => s.is_bookable)).toBe(true)
  })

  it("starts Monday/Sunday collection at 11:00 even if store opens at 08:00", () => {
    const hours = expandDailyHours("08:00", "14:00")
    const sunSlots = buildDaySlots({
      date: sunday,
      openingHours: hours,
      capacityPerSlot: 5,
      leadTimeHours: 0,
      now: new Date("2026-07-12T07:00:00"),
    })
    const monSlots = buildDaySlots({
      date: monday,
      openingHours: hours,
      capacityPerSlot: 5,
      leadTimeHours: 0,
      now: new Date("2026-07-13T07:00:00"),
    })
    expect(sunSlots[0]?.time).toBe("11:00")
    expect(monSlots[0]?.time).toBe("11:00")
    expect(sunSlots.some((s) => s.time === "10:00")).toBe(false)
    expect(monSlots.some((s) => s.time === "08:00")).toBe(false)
  })

  it("starts Tue–Sat collection at 10:00 even if store opens at 08:00", () => {
    const slots = buildDaySlots({
      date: friday,
      openingHours: expandDailyHours("08:00", "12:00"),
      capacityPerSlot: 5,
      leadTimeHours: 0,
      now,
    })
    expect(slots[0]?.time).toBe("10:00")
    expect(slots.map((s) => s.time)).not.toContain("08:00")
    expect(slots.map((s) => s.time)).not.toContain("09:30")
  })

  it("still generates slots when openingHours is null (legacy seed bug)", () => {
    const slots = buildDaySlots({
      date: friday,
      openingHours: null,
      capacityPerSlot: 10,
      leadTimeHours: 0,
      now,
      metadata: { store_hours: { open: "10:00", close: "11:00" } },
    })
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0].time).toBe("10:00")
  })

  it("uses DEFAULT_OPENING_HOURS when both column and metadata are empty", () => {
    const slots = buildDaySlots({
      date: friday,
      openingHours: null,
      capacityPerSlot: 3,
      leadTimeHours: 0,
      now,
    })
    // Fri default 10:00–18:00 → 16 half-hour slots
    expect(slots.length).toBe(16)
    expect(slots[0].time).toBe("10:00")
    expect(slots[slots.length - 1].time).toBe("17:30")
  })

  it("marks slots inside lead-time window unbookable", () => {
    // now 10:00, lead 2h → cutoff 12:00 — morning slots not bookable
    const lateMorning = new Date("2026-07-10T10:00:00")
    const slots = buildDaySlots({
      date: friday,
      openingHours: expandDailyHours("09:00", "14:00"),
      capacityPerSlot: 5,
      leadTimeHours: 2,
      now: lateMorning,
    })
    // 09:00 is before policy earliest — not generated
    expect(slots.find((s) => s.time === "09:00")).toBeUndefined()
    const ten = slots.find((s) => s.time === "10:00")
    const elevenThirty = slots.find((s) => s.time === "11:30")
    const noon = slots.find((s) => s.time === "12:00")
    const one = slots.find((s) => s.time === "13:00")
    expect(ten?.is_bookable).toBe(false)
    expect(elevenThirty?.is_bookable).toBe(false) // before cutoff (now+2h = 12:00)
    // slotStart < cutoffMs → equality is still bookable
    expect(noon?.is_bookable).toBe(true)
    expect(one?.is_bookable).toBe(true)
  })

  it("returns [] for invalid date format", () => {
    expect(
      buildDaySlots({
        date: "10/07/2026",
        openingHours: DEFAULT_OPENING_HOURS,
        capacityPerSlot: 5,
        leadTimeHours: 0,
        now,
      })
    ).toEqual([])
  })

  it("24h lead blocks all same-day slots after morning", () => {
    const late = new Date("2026-07-10T10:00:00")
    const slots = buildDaySlots({
      date: friday,
      openingHours: expandDailyHours("09:00", "18:00"),
      capacityPerSlot: 10,
      leadTimeHours: 24,
      now: late,
    })
    expect(slots.every((s) => !s.is_bookable)).toBe(true)
  })
})

describe("applySlotUsage — capacity consumed by bookings", () => {
  const now = new Date("2026-07-10T08:00:00")
  const friday = "2026-07-10"

  it("reduces available_capacity and marks full slots unbookable", () => {
    const slots = buildDaySlots({
      date: friday,
      openingHours: expandDailyHours("10:00", "12:00"),
      capacityPerSlot: 10,
      leadTimeHours: 0,
      now,
    })
    applySlotUsage(slots, new Map([["10:00", 10], ["10:30", 1]]))

    const ten = slots.find((s) => s.time === "10:00")
    const tenThirty = slots.find((s) => s.time === "10:30")
    const eleven = slots.find((s) => s.time === "11:00")

    expect(ten?.available_capacity).toBe(0)
    expect(ten?.is_bookable).toBe(false)
    expect(tenThirty?.available_capacity).toBe(9)
    expect(tenThirty?.is_bookable).toBe(true)
    expect(eleven?.available_capacity).toBe(10)
  })
})

describe("extractSlotStart", () => {
  it("parses 24h range labels", () => {
    expect(extractSlotStart("09:00 – 09:30")).toBe("09:00")
    expect(extractSlotStart("14:30")).toBe("14:30")
  })

  it("snaps odd minutes to 30-min floor", () => {
    expect(extractSlotStart("09:15")).toBe("09:00")
    expect(extractSlotStart("09:45")).toBe("09:30")
  })
})

describe("computeDeliveryFee / haversineMi", () => {
  const cfg: DeliveryFeeConfig = {
    freeMiles: 1,
    perMileGbp: 4.49,
    roadFactor: 1.3,
    defaultRadiusMi: 10,
    freeOverGbp: 150,
  }

  it("returns 0 within the free first mile", () => {
    expect(computeDeliveryFee(0.5, cfg)).toBe(0)
    expect(computeDeliveryFee(1.0, cfg)).toBe(0)
  })

  it("charges (miles − 1) × per-mile after free band", () => {
    // 3.2 mi → 2.2 × 4.49 = 9.878 → £9.88
    expect(computeDeliveryFee(3.2, cfg)).toBe(9.88)
    // 10.0 mi → 9 × 4.49 = 40.41
    expect(computeDeliveryFee(10, cfg)).toBe(40.41)
  })

  it("returns 0 when merchandise subtotal is at/above free-over threshold", () => {
    expect(computeDeliveryFee(8, cfg, 150)).toBe(0)
    expect(computeDeliveryFee(8, cfg, 200)).toBe(0)
    expect(computeDeliveryFee(8, cfg, 149.99)).toBe(
      computeDeliveryFee(8, cfg)
    )
  })

  it("computes amount still needed for free delivery", () => {
    expect(amountToFreeDelivery(40, cfg)).toBe(110)
    expect(amountToFreeDelivery(150, cfg)).toBe(0)
  })

  it("computes positive distance between known points", () => {
    // Birmingham centre-ish → nearby
    const mi = haversineMi(52.48, -1.9, 52.49, -1.91)
    expect(mi).toBeGreaterThan(0)
    expect(mi).toBeLessThan(5)
  })
})

describe("quoteLocalDelivery — canonical quote/charge policy", () => {
  const cfg: DeliveryFeeConfig = {
    freeMiles: 1,
    perMileGbp: 4.49,
    roadFactor: 1.3,
    defaultRadiusMi: 10,
    freeOverGbp: 150,
  }

  const store = {
    id: "stloc_1",
    name: "Cake Break Test",
    latitude: 52.48,
    longitude: -1.9,
    metadata: { delivery_radius_mi: 10 },
  }

  it("produces a deterministic fee for fixed destination coordinates", async () => {
    const dest = { lat: 52.49, lng: -1.91 }
    const a = await quoteLocalDelivery({ store, dest, config: cfg })
    const b = await quoteLocalDelivery({ store, dest, config: cfg })
    expect(a.deliverable).toBe(true)
    expect(b.deliverable).toBe(true)
    expect(a.fee).toBe(b.fee)
    expect(a.distance_mi).toBe(b.distance_mi)
    expect(a.source).toBe("haversine")
  })

  it("prevents quote-vs-charge penny splits from unrounded distance", async () => {
    const drivingDistance = async () => ({ mi: 4.6349, minutes: 12 })
    const viaDriving = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: cfg,
      drivingDistance,
    })
    const rounded = roundDistanceMi(4.6349)
    expect(rounded).toBe(4.63)
    expect(viaDriving.distance_mi).toBe(rounded)
    expect(viaDriving.fee).toBe(computeDeliveryFee(rounded, cfg))
    const again = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: cfg,
      drivingDistance,
    })
    expect(again.fee).toBe(viaDriving.fee)
    expect(again.distance_mi).toBe(viaDriving.distance_mi)
  })

  it("treats distance equal to radius as deliverable", async () => {
    const drivingDistance = async () => ({ mi: 10, minutes: 20 })
    const quote = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: cfg,
      drivingDistance,
    })
    expect(quote.deliverable).toBe(true)
    expect(quote.fee).toBe(computeDeliveryFee(10, cfg))
  })

  it("rejects destinations outside the radius", async () => {
    const drivingDistance = async () => ({ mi: 10.01, minutes: 25 })
    const quote = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: cfg,
      drivingDistance,
    })
    expect(quote.deliverable).toBe(false)
    expect(quote.error).toBe("outside_radius")
    expect(quote.fee).toBe(0)
    expect(quote.message).toMatch(/10 mile delivery radius/)
  })

  it("honours free first mile and free-over merchandise threshold", async () => {
    const freeMile = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: cfg,
      drivingDistance: async () => ({ mi: 0.8, minutes: 5 }),
    })
    expect(freeMile.deliverable).toBe(true)
    expect(freeMile.fee).toBe(0)

    const freeOrder = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: cfg,
      merchandise_subtotal: 150,
      drivingDistance: async () => ({ mi: 8, minutes: 15 }),
    })
    expect(freeOrder.deliverable).toBe(true)
    expect(freeOrder.fee).toBe(0)

    const paid = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: cfg,
      merchandise_subtotal: 40,
      drivingDistance: async () => ({ mi: 3.2, minutes: 10 }),
    })
    expect(paid.deliverable).toBe(true)
    expect(paid.fee).toBe(9.88)
    expect(paid.amount_to_free_delivery).toBe(110)
  })

  it("ignores legacy delivery_radius_km and uses default miles radius", async () => {
    const quote = await quoteLocalDelivery({
      store: {
        ...store,
        metadata: { delivery_radius_km: 10 },
      },
      dest: { lat: 1, lng: 1 },
      config: cfg,
      // 10 mi is within default 10 mi radius; would be outside if 10 were still km.
      drivingDistance: async () => ({ mi: 9.5, minutes: 20 }),
    })
    expect(quote.deliverable).toBe(true)
    expect(quote.max_radius_mi).toBe(10)
  })

  it("fails clearly when store has no coordinates", async () => {
    const quote = await quoteLocalDelivery({
      store: { ...store, latitude: null, longitude: null },
      dest: { lat: 52.49, lng: -1.91 },
      config: cfg,
    })
    expect(quote.deliverable).toBe(false)
    expect(quote.error).toBe("missing_coords")
  })

  it("fails clearly when postcode cannot be resolved", async () => {
    const quote = await quoteLocalDelivery({
      store,
      postcode: "ZZ1 1ZZ",
      config: cfg,
      geocode: async () => null,
    })
    expect(quote.deliverable).toBe(false)
    expect(quote.error).toBe("unresolvable_postcode")
  })

  it("fails clearly when neither dest nor postcode is provided", async () => {
    const quote = await quoteLocalDelivery({ store, config: cfg })
    expect(quote.deliverable).toBe(false)
    expect(quote.error).toBe("missing_destination")
  })
})

describe("merchandiseSubtotalForDelivery — free-over SSOT", () => {
  it("sums line items and ignores tax-inclusive item_total", () => {
    expect(
      merchandiseSubtotalForDelivery({
        items: [
          { unit_price: 50, quantity: 2, subtotal: 100 },
          { unit_price: 45, quantity: 1, subtotal: 45 },
        ],
        item_total: 174, // tax-inflated — must not win over lines
        subtotal: 145 + 9.88, // shipping-inflated — must not win over lines
        shipping_total: 9.88,
      })
    ).toBe(145)
  })

  it("subtracts line discounts (pre-tax)", () => {
    expect(
      merchandiseSubtotalForDelivery({
        items: [
          {
            unit_price: 100,
            quantity: 1,
            subtotal: 100,
            discount_subtotal: 10,
          },
        ],
      })
    ).toBe(90)
  })

  it("subtracts adjustment amounts when discount fields missing", () => {
    expect(
      merchandiseSubtotalForDelivery({
        items: [
          {
            unit_price: 80,
            quantity: 2,
            adjustments: [{ amount: 15 }],
          },
        ],
      })
    ).toBe(145)
  })

  it("does not count attached shipping as merchandise (last-resort path)", () => {
    // No lines / item_subtotal — strip shipping from cart.subtotal.
    expect(
      merchandiseSubtotalForDelivery({
        subtotal: 145 + 9.88,
        shipping_total: 9.88,
        discount_total: 0,
      })
    ).toBe(145)
  })

  it("uses item_subtotal − item_discount_total when lines missing", () => {
    expect(
      merchandiseSubtotalForDelivery({
        item_subtotal: 160,
        item_discount_total: 10,
        // Tax-inclusive must not be used
        item_total: 180,
      })
    ).toBe(150)
  })

  it("returns undefined when nothing usable is present", () => {
    expect(merchandiseSubtotalForDelivery({})).toBeUndefined()
    expect(merchandiseSubtotalForDelivery(null)).toBeUndefined()
  })
})
