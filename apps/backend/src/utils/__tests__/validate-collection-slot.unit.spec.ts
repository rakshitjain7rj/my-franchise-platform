import {
  assertCollectionSlotAllowed,
  collectionRequestFromMetadata,
  resolveCollectionRequest,
  parseSlotStart,
} from "../validate-collection-slot"
import { expandDailyHours } from "../logistics"

const openAllDay = expandDailyHours("09:00", "18:00")

const baseStore = {
  id: "stloc_test",
  name: "Test Bakery",
  is_active: true,
  is_accepting_orders: true,
  custom_lead_time_hours: 24,
  opening_hours: openAllDay,
  daily_order_capacity: 10,
  metadata: null,
}

describe("assertCollectionSlotAllowed", () => {
  const now = new Date("2026-07-27T14:00:00")

  it("rejects missing date/time", () => {
    expect(() => assertCollectionSlotAllowed(baseStore, {}, now)).toThrow(
      /collection date/i
    )
  })

  it("rejects slots inside 24h lead time", () => {
    expect(() =>
      assertCollectionSlotAllowed(
        baseStore,
        { date: "2026-07-27", time: "16:00" },
        now
      )
    ).toThrow(/at least 24 hours notice/i)
  })

  it("allows slots after lead time window", () => {
    expect(() =>
      assertCollectionSlotAllowed(
        baseStore,
        { date: "2026-07-29", time: "10:00" },
        now
      )
    ).not.toThrow()
  })

  it("allows same-day slots when lead time is 0 (immediate)", () => {
    expect(() =>
      assertCollectionSlotAllowed(
        { ...baseStore, custom_lead_time_hours: 0 },
        { date: "2026-07-27", time: "16:00" },
        now
      )
    ).not.toThrow()
  })

  it("rejects when bakery is not accepting orders", () => {
    expect(() =>
      assertCollectionSlotAllowed(
        { ...baseStore, is_accepting_orders: false },
        { date: "2026-07-29", time: "10:00" },
        now
      )
    ).toThrow(/not accepting orders/i)
  })

  it("accepts range labels like 10:00 – 10:30", () => {
    expect(() =>
      assertCollectionSlotAllowed(
        baseStore,
        { date: "2026-07-29", time: "10:00 – 10:30", label: "10:00 – 10:30" },
        now
      )
    ).not.toThrow()
  })

  it("uses kitchen-busy copy when kitchenBusy is true", () => {
    expect(() =>
      assertCollectionSlotAllowed(
        baseStore,
        { date: "2026-07-27", time: "16:00" },
        { now, kitchenBusy: true }
      )
    ).toThrow(/kitchen is busy/i)
  })

  it("rejects times outside the opening-hours grid", () => {
    // Store opens 09:00 — 08:00 is not a generated slot (extractSlotStart
    // snaps odd minutes to the 30-min floor, so use a clean off-hours start).
    expect(() =>
      assertCollectionSlotAllowed(
        baseStore,
        { date: "2026-07-29", time: "08:00" },
        { now, requireGridSlot: true }
      )
    ).toThrow(/not a valid slot/i)
  })

  it("rejects when the slot is full after usage", () => {
    expect(() =>
      assertCollectionSlotAllowed(
        { ...baseStore, daily_order_capacity: 2, custom_lead_time_hours: 0 },
        { date: "2026-07-27", time: "16:00" },
        {
          now,
          usageBySlotStart: { "16:00": 2 },
          requireCapacity: true,
        }
      )
    ).toThrow(/slot is full/i)
  })

  it("allows a slot that is only slightly past due thanks to the 2-minute grace", () => {
    // lead 0: without grace, now 15:01 would reject slot 15:00; with grace it passes.
    expect(() =>
      assertCollectionSlotAllowed(
        { ...baseStore, custom_lead_time_hours: 0 },
        { date: "2026-07-27", time: "15:00" },
        {
          now: new Date("2026-07-27T15:01:00"),
          requireGridSlot: true,
        }
      )
    ).not.toThrow()
  })
})

describe("resolveCollectionRequest", () => {
  it("prefers cart metadata when present", () => {
    expect(
      resolveCollectionRequest(
        {
          requested_pickup_date: "2026-07-29",
          requested_pickup_time: "10:00",
        },
        [
          {
            metadata: {
              custom_attributes: { date: "2026-07-30", time: "11:00" },
            },
          },
        ]
      )
    ).toMatchObject({ date: "2026-07-29", time: "10:00" })
  })

  it("falls back to line custom_attributes", () => {
    expect(
      resolveCollectionRequest({}, [
        {
          metadata: {
            custom_attributes: { date: "2026-07-30", time: "11:00 – 11:30" },
          },
        },
      ])
    ).toMatchObject({
      date: "2026-07-30",
      time: "11:00 – 11:30",
    })
  })
})

describe("collectionRequestFromMetadata", () => {
  it("maps cart metadata fields", () => {
    expect(
      collectionRequestFromMetadata({
        requested_pickup_date: "2026-07-29",
        requested_pickup_time: "10:00",
        requested_pickup_label: "10:00 – 10:30",
      })
    ).toEqual({
      date: "2026-07-29",
      time: "10:00",
      label: "10:00 – 10:30",
      iso: null,
    })
  })
})

describe("parseSlotStart", () => {
  it("parses date and time", () => {
    const d = parseSlotStart("2026-07-29", "10:00")
    expect(d).not.toBeNull()
    expect(d!.getHours()).toBe(10)
  })
})
