/**
 * Unit tests for logistics helpers — slot generation, opening-hours resolution,
 * and delivery fee maths. These pin the root-cause fix for empty slots when
 * opening_hours was null (seed historically only wrote metadata.store_hours).
 */

import {
  DEFAULT_OPENING_HOURS,
  buildDaySlots,
  computeDeliveryFee,
  expandDailyHours,
  extractSlotStart,
  formatHHMM,
  haversineKm,
  parseHHMM,
  quoteLocalDelivery,
  resolveOpeningHours,
  roundDistanceKm,
  type DeliveryFeeConfig,
} from "../logistics"

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

describe("buildDaySlots", () => {
  // Fixed "now": 2026-07-10 08:00 local — lead time 0 so all open-window slots bookable
  const now = new Date("2026-07-10T08:00:00")
  // 2026-07-10 is a Friday
  const friday = "2026-07-10"

  it("generates 30-min slots from opening hours", () => {
    const slots = buildDaySlots({
      date: friday,
      openingHours: expandDailyHours("09:00", "11:00"),
      capacityPerSlot: 5,
      leadTimeHours: 0,
      now,
    })
    expect(slots.map((s) => s.time)).toEqual(["09:00", "09:30", "10:00", "10:30"])
    expect(slots.every((s) => s.available_capacity === 5)).toBe(true)
    expect(slots.every((s) => s.is_bookable)).toBe(true)
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
    // 09:00–18:00 → 18 half-hour slots
    expect(slots.length).toBe(18)
    expect(slots[0].time).toBe("09:00")
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
    const nine = slots.find((s) => s.time === "09:00")
    const elevenThirty = slots.find((s) => s.time === "11:30")
    const noon = slots.find((s) => s.time === "12:00")
    const one = slots.find((s) => s.time === "13:00")
    expect(nine?.is_bookable).toBe(false)
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

describe("computeDeliveryFee / haversineKm", () => {
  it("returns 0 for free-under-km range", () => {
    expect(
      computeDeliveryFee(0.5, {
        baseFee: 2.5,
        perKm: 0.75,
        freeUnderKm: 1,
        maxFee: 15,
        roadFactor: 1.3,
        defaultRadiusKm: 10,
      })
    ).toBe(0)
  })

  it("applies base + per-km and caps at max", () => {
    const cfg = {
      baseFee: 2.5,
      perKm: 0.75,
      freeUnderKm: 0,
      maxFee: 5,
      roadFactor: 1.3,
      defaultRadiusKm: 10,
    }
    expect(computeDeliveryFee(2, cfg)).toBe(4) // 2.5 + 1.5
    expect(computeDeliveryFee(20, cfg)).toBe(5) // capped
  })

  it("computes positive distance between known points", () => {
    // Birmingham centre-ish → nearby
    const km = haversineKm(52.48, -1.9, 52.49, -1.91)
    expect(km).toBeGreaterThan(0)
    expect(km).toBeLessThan(5)
  })
})

describe("quoteLocalDelivery — canonical quote/charge policy", () => {
  const cfg: DeliveryFeeConfig = {
    baseFee: 2.5,
    perKm: 0.75,
    freeUnderKm: 0,
    maxFee: 15,
    roadFactor: 1.3,
    defaultRadiusKm: 10,
  }

  const store = {
    id: "stloc_1",
    name: "Cake Break Test",
    latitude: 52.48,
    longitude: -1.9,
    metadata: { delivery_radius_km: 10 },
  }

  it("produces a deterministic fee for fixed destination coordinates", async () => {
    const dest = { lat: 52.49, lng: -1.91 }
    const a = await quoteLocalDelivery({ store, dest, config: cfg })
    const b = await quoteLocalDelivery({ store, dest, config: cfg })
    expect(a.deliverable).toBe(true)
    expect(b.deliverable).toBe(true)
    expect(a.fee).toBe(b.fee)
    expect(a.distance_km).toBe(b.distance_km)
    expect(a.source).toBe("haversine")
  })

  it("prevents quote-vs-charge penny splits from unrounded distance", async () => {
    // Raw haversine×roadFactor of 4.6349 km used to diverge after fee rounding
    // depending on whether distance was rounded first. Both call shapes must match.
    const drivingDistance = async () => ({ km: 4.6349, minutes: 12 })
    const viaDriving = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: cfg,
      drivingDistance,
    })
    const rounded = roundDistanceKm(4.6349)
    expect(rounded).toBe(4.63)
    expect(viaDriving.distance_km).toBe(rounded)
    expect(viaDriving.fee).toBe(computeDeliveryFee(rounded, cfg))
    // Second independent call (simulates endpoint vs provider) is identical.
    const again = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: cfg,
      drivingDistance,
    })
    expect(again.fee).toBe(viaDriving.fee)
    expect(again.distance_km).toBe(viaDriving.distance_km)
  })

  it("treats distance equal to radius as deliverable", async () => {
    const drivingDistance = async () => ({ km: 10, minutes: 20 })
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
    const drivingDistance = async () => ({ km: 10.01, minutes: 25 })
    const quote = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: cfg,
      drivingDistance,
    })
    expect(quote.deliverable).toBe(false)
    expect(quote.error).toBe("outside_radius")
    expect(quote.fee).toBe(0)
  })

  it("honours freeUnderKm and fee cap", async () => {
    const freeCfg: DeliveryFeeConfig = { ...cfg, freeUnderKm: 5, maxFee: 4 }
    const free = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: freeCfg,
      drivingDistance: async () => ({ km: 3, minutes: 5 }),
    })
    expect(free.deliverable).toBe(true)
    expect(free.fee).toBe(0)

    const capped = await quoteLocalDelivery({
      store,
      dest: { lat: 1, lng: 1 },
      config: freeCfg,
      drivingDistance: async () => ({ km: 9, minutes: 15 }),
    })
    expect(capped.deliverable).toBe(true)
    expect(capped.fee).toBe(4)
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
