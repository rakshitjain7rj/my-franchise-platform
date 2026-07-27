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
