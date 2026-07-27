/**
 * Booking ops unit tests — lead time, slot capacity, and SKU inventory.
 *
 * These pin the rules that keep checkout uninterrupted and consistent:
 *   1. Lead time blocks slots that are too soon (default 24h).
 *   2. Slot capacity (default 10) is per 30-min window, not per day.
 *   3. SKU stock = 0 means out of stock / cart blocked at that branch.
 *
 * Run: cd apps/backend && npm run test:unit
 */

import {
  applySlotUsage,
  buildDaySlots,
  expandDailyHours,
  type TimeSlot,
} from "../logistics"
import {
  computeAvailableQuantity,
  evaluateCartInventory,
  isInventorySufficient,
  isProductAvailableFromVariants,
  isSkuInStock,
} from "../inventory-availability"

// Shared calendar: Friday 2026-07-10
const FRIDAY = "2026-07-10"
const OPEN = expandDailyHours("09:00", "14:00")

function slotMap(slots: TimeSlot[]): Map<string, TimeSlot> {
  return new Map(slots.map((s) => [s.time, s]))
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Lead time
// ═══════════════════════════════════════════════════════════════════════════

describe("Lead time — minimum advance booking window", () => {
  it("default 24h: morning slots today are unbookable after morning now", () => {
    // now Friday 10:00, lead 24h → cutoff Saturday 10:00
    // so ALL Friday slots are unbookable
    const now = new Date("2026-07-10T10:00:00")
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: OPEN,
      capacityPerSlot: 10,
      leadTimeHours: 24,
      now,
    })

    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every((s) => s.is_bookable === false)).toBe(true)
  })

  it("default 24h: same-time-next-day slot is bookable", () => {
    // now Friday 10:00, lead 24h → cutoff Saturday 10:00
    const now = new Date("2026-07-10T10:00:00")
    const saturday = "2026-07-11"
    const slots = buildDaySlots({
      date: saturday,
      openingHours: OPEN,
      capacityPerSlot: 10,
      leadTimeHours: 24,
      now,
    })
    const map = slotMap(slots)
    // 09:00 Sat is before cutoff (Sat 10:00) → unbookable
    expect(map.get("09:00")?.is_bookable).toBe(false)
    // 10:00 Sat equals cutoff → bookable (slotStart < cutoff is the block rule)
    expect(map.get("10:00")?.is_bookable).toBe(true)
    expect(map.get("11:00")?.is_bookable).toBe(true)
  })

  it("2h lead: only slots before now+2h are blocked", () => {
    const now = new Date("2026-07-10T10:00:00")
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: OPEN,
      capacityPerSlot: 10,
      leadTimeHours: 2,
      now,
    })
    const map = slotMap(slots)
    expect(map.get("09:00")?.is_bookable).toBe(false)
    expect(map.get("11:30")?.is_bookable).toBe(false) // before 12:00
    expect(map.get("12:00")?.is_bookable).toBe(true)
    expect(map.get("13:00")?.is_bookable).toBe(true)
  })

  it("0h lead: every in-hours future slot is bookable", () => {
    const now = new Date("2026-07-10T08:00:00")
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: OPEN,
      capacityPerSlot: 10,
      leadTimeHours: 0,
      now,
    })
    expect(slots.every((s) => s.is_bookable)).toBe(true)
  })

  it("lead time does not change capacity numbers", () => {
    const now = new Date("2026-07-10T10:00:00")
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: OPEN,
      capacityPerSlot: 10,
      leadTimeHours: 24,
      now,
    })
    // Even blocked slots retain their capacity figure until bookings are applied
    expect(slots.every((s) => s.available_capacity === 10)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Slot capacity (daily_order_capacity → per 30-min slot)
// ═══════════════════════════════════════════════════════════════════════════

describe("Slot capacity — orders per 30-minute window", () => {
  const now = new Date("2026-07-10T08:00:00")

  it("default capacity 10 is applied to every generated slot", () => {
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: OPEN,
      capacityPerSlot: 10,
      leadTimeHours: 0,
      now,
    })
    expect(slots.length).toBe(10) // 09:00–14:00 → 10 half-hours
    expect(slots.every((s) => s.available_capacity === 10)).toBe(true)
    expect(slots.every((s) => s.is_bookable)).toBe(true)
  })

  it("capacity 0 makes every slot unbookable (kitchen closed for bookings)", () => {
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: OPEN,
      capacityPerSlot: 0,
      leadTimeHours: 0,
      now,
    })
    expect(slots.every((s) => s.available_capacity === 0)).toBe(true)
    expect(slots.every((s) => s.is_bookable === false)).toBe(true)
  })

  it("each booking consumes one unit of capacity in that slot only", () => {
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: OPEN,
      capacityPerSlot: 10,
      leadTimeHours: 0,
      now,
    })

    applySlotUsage(slots, {
      "10:00": 3,
      "11:00": 10,
    })

    const map = slotMap(slots)
    expect(map.get("09:00")?.available_capacity).toBe(10)
    expect(map.get("09:00")?.is_bookable).toBe(true)

    expect(map.get("10:00")?.available_capacity).toBe(7)
    expect(map.get("10:00")?.is_bookable).toBe(true)

    // Full slot — user cannot pick it (uninterrupted: hide/disable full times)
    expect(map.get("11:00")?.available_capacity).toBe(0)
    expect(map.get("11:00")?.is_bookable).toBe(false)

    // Other slot untouched
    expect(map.get("12:00")?.available_capacity).toBe(10)
  })

  it("over-booking usage never makes capacity negative", () => {
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: expandDailyHours("09:00", "10:00"),
      capacityPerSlot: 5,
      leadTimeHours: 0,
      now,
    })
    applySlotUsage(slots, { "09:00": 99 })
    expect(slots[0].available_capacity).toBe(0)
    expect(slots[0].is_bookable).toBe(false)
  })

  it("full day total can exceed 10 when capacity is 10 per slot", () => {
    // User misconception guard: capacity is NOT "10 orders per day"
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: expandDailyHours("09:00", "12:00"),
      capacityPerSlot: 10,
      leadTimeHours: 0,
      now,
    })
    const theoreticalDayMax = slots.reduce(
      (sum, s) => sum + s.available_capacity,
      0
    )
    expect(slots.length).toBe(6) // 09:00, 09:30, 10:00, 10:30, 11:00, 11:30
    expect(theoreticalDayMax).toBe(60)
  })

  it("lead-time blocked slots stay unbookable even with free capacity", () => {
    const late = new Date("2026-07-10T11:00:00")
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: OPEN,
      capacityPerSlot: 10,
      leadTimeHours: 2, // cutoff 13:00
      now: late,
    })
    // No bookings applied — 09:00 still blocked by lead time
    applySlotUsage(slots, {})
    const map = slotMap(slots)
    expect(map.get("09:00")?.available_capacity).toBe(10)
    expect(map.get("09:00")?.is_bookable).toBe(false)
    expect(map.get("13:00")?.is_bookable).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. SKU inventory (stock qty → out of stock / cart block)
// ═══════════════════════════════════════════════════════════════════════════

describe("SKU inventory — stocked qty gates selling", () => {
  it("available = stocked − reserved (never negative)", () => {
    expect(computeAvailableQuantity(50, 3)).toBe(47)
    expect(computeAvailableQuantity(10, 10)).toBe(0)
    expect(computeAvailableQuantity(5, 20)).toBe(0)
    expect(computeAvailableQuantity(0, 0)).toBe(0)
  })

  it("SKU qty 0 is out of stock", () => {
    expect(
      isSkuInStock({
        manage_inventory: true,
        inventory_quantity: 0,
      })
    ).toBe(false)
  })

  it("SKU qty > 0 is in stock", () => {
    expect(
      isSkuInStock({
        manage_inventory: true,
        inventory_quantity: 50,
      })
    ).toBe(true)
  })

  it("admin restock: raising qty from 0 restores sellability", () => {
    const before = isSkuInStock({
      manage_inventory: true,
      inventory_quantity: 0,
    })
    const after = isSkuInStock({
      manage_inventory: true,
      inventory_quantity: 25,
    })
    expect(before).toBe(false)
    expect(after).toBe(true)
  })

  it("manage_inventory false always sells (digital / unlimited)", () => {
    expect(
      isSkuInStock({
        manage_inventory: false,
        inventory_quantity: 0,
      })
    ).toBe(true)
  })

  it("allow_backorder sells even at qty 0", () => {
    expect(
      isSkuInStock({
        manage_inventory: true,
        allow_backorder: true,
        inventory_quantity: 0,
      })
    ).toBe(true)
  })

  it("product is available if ANY variant SKU has stock", () => {
    expect(
      isProductAvailableFromVariants([
        { manage_inventory: true, inventory_quantity: 0 },
        { manage_inventory: true, inventory_quantity: 3 },
      ])
    ).toBe(true)

    expect(
      isProductAvailableFromVariants([
        { manage_inventory: true, inventory_quantity: 0 },
        { manage_inventory: true, inventory_quantity: 0 },
      ])
    ).toBe(false)
  })

  it("cart: requested > available blocks checkout (is_sufficient false)", () => {
    expect(isInventorySufficient(0, 1)).toBe(false)
    expect(isInventorySufficient(2, 3)).toBe(false)
    expect(isInventorySufficient(5, 5)).toBe(true)
    expect(isInventorySufficient(10, 1)).toBe(true)
  })

  it("cart-inventory-check shape: all_sufficient false when any line fails", () => {
    const result = evaluateCartInventory([
      {
        variant_id: "var_in_stock",
        requested_quantity: 2,
        available_quantity: 10,
      },
      {
        variant_id: "var_oos",
        requested_quantity: 1,
        available_quantity: 0,
      },
    ])

    expect(result.all_sufficient).toBe(false)
    expect(result.items[0].is_sufficient).toBe(true)
    expect(result.items[1].is_sufficient).toBe(false)
    expect(result.items[1].available_quantity).toBe(0)
  })

  it("cart-inventory-check: full cart OK when every SKU has stock", () => {
    const result = evaluateCartInventory([
      {
        variant_id: "var_a",
        requested_quantity: 1,
        available_quantity: 50,
      },
      {
        variant_id: "var_b",
        requested_quantity: 3,
        available_quantity: 3,
      },
    ])
    expect(result.all_sufficient).toBe(true)
  })

  it("no inventory item (null available) does not block cart", () => {
    const result = evaluateCartInventory([
      {
        variant_id: "var_unmanaged",
        requested_quantity: 5,
        available_quantity: null,
      },
    ])
    expect(result.all_sufficient).toBe(true)
    expect(result.items[0].is_sufficient).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. Cross-cutting consistency (user uninterrupted)
// ═══════════════════════════════════════════════════════════════════════════

describe("Consistency — stock, slots, and lead time are independent gates", () => {
  const now = new Date("2026-07-10T08:00:00")

  it("in-stock SKU still cannot use a full time slot", () => {
    const skuOk = isSkuInStock({
      manage_inventory: true,
      inventory_quantity: 50,
    })
    expect(skuOk).toBe(true)

    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: expandDailyHours("09:00", "10:00"),
      capacityPerSlot: 10,
      leadTimeHours: 0,
      now,
    })
    applySlotUsage(slots, { "09:00": 10 })

    // User still sees cake as available, but 09:00 is not bookable
    expect(slots[0].is_bookable).toBe(false)
    expect(slots[0].available_capacity).toBe(0)
  })

  it("empty slot still cannot sell OOS SKU", () => {
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: expandDailyHours("09:00", "10:00"),
      capacityPerSlot: 10,
      leadTimeHours: 0,
      now,
    })
    expect(slots[0].is_bookable).toBe(true)

    const cart = evaluateCartInventory([
      {
        variant_id: "var_zero",
        requested_quantity: 1,
        available_quantity: 0,
      },
    ])
    // Checkout must stay blocked — uninterrupted = clear OOS, no false "OK"
    expect(cart.all_sufficient).toBe(false)
  })

  it("lead-time-blocked slot stays blocked even with stock and free capacity", () => {
    const nowBusy = new Date("2026-07-10T12:00:00")
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: OPEN,
      capacityPerSlot: 10,
      leadTimeHours: 24,
      now: nowBusy,
    })
    applySlotUsage(slots, {}) // no bookings

    const skuOk = isSkuInStock({
      manage_inventory: true,
      inventory_quantity: 50,
    })
    expect(skuOk).toBe(true)
    expect(slots.every((s) => s.is_bookable === false)).toBe(true)
  })

  it("happy path: stock + free slot past lead time → can proceed", () => {
    const nowEarly = new Date("2026-07-10T08:00:00")
    const slots = buildDaySlots({
      date: FRIDAY,
      openingHours: OPEN,
      capacityPerSlot: 10,
      leadTimeHours: 0,
      now: nowEarly,
    })
    applySlotUsage(slots, { "09:00": 2 })

    const cart = evaluateCartInventory([
      {
        variant_id: "var_cake",
        requested_quantity: 1,
        available_quantity: computeAvailableQuantity(50, 0),
      },
    ])

    const nine = slotMap(slots).get("09:00")
    expect(cart.all_sufficient).toBe(true)
    expect(nine?.is_bookable).toBe(true)
    expect(nine?.available_capacity).toBe(8)
  })
})
