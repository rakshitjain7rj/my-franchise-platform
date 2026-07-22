/**
 * Lightweight assertions for cake metadata contracts.
 * Run: npx tsx src/types/cake-metadata.unit.test.ts
 */
import {
  buildCustomAttributes,
  collectionSlotToCartMetadata,
  extractSlotStartTime,
  getLineCollectionSlot,
  isFulfillmentOptionTitle,
} from "./cake-metadata"

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(isFulfillmentOptionTitle("Delivery Method"), "Delivery Method is fulfillment option")
assert(isFulfillmentOptionTitle("fulfillment"), "fulfillment is fulfillment option")
assert(!isFulfillmentOptionTitle("Size"), "Size is not fulfillment option")

const attrs = buildCustomAttributes({
  jam: "Mixed Jam",
  date: "2026-07-20",
  time: "12:30 – 13:00",
  extraOptions: {
    Size: '8" (approx 12 servings)',
    "Delivery Method": "Collection",
  },
})
assert(!("Delivery Method" in attrs), "must not write Delivery Method option")
assert(attrs.Size?.includes("8"), "Size option kept")
assert(attrs.time === "12:30 – 13:00", "time label kept on line attrs")

const slot = collectionSlotToCartMetadata({
  date: "2026-07-20",
  time: "12:30",
  label: "12:30 – 13:00",
})
assert(slot.requested_pickup_time === "12:30", "cart time is HH:mm start")
assert(slot.requested_pickup_label === "12:30 – 13:00", "cart label is range")
assert(slot.requested_pickup_iso === "2026-07-20T12:30:00", "iso uses start")

const fromLabelOnly = collectionSlotToCartMetadata({
  date: "2026-07-23",
  time: "09:00 – 09:30",
})
assert(fromLabelOnly.requested_pickup_time === "09:00", "parse start from range time")
assert(fromLabelOnly.requested_pickup_label.includes("09:30"), "label preserved")

const line = getLineCollectionSlot({
  metadata: {
    custom_attributes: { date: "2026-07-20", time: "12:30 – 13:00" },
  },
})
assert(line?.date === "2026-07-20", "line date")
assert(line?.time === "12:30", "line time start")
assert(line?.label === "12:30 – 13:00", "line label")
assert(extractSlotStartTime("09:00 – 09:30") === "09:00", "extract start")

console.log("cake-metadata.unit.test.ts: all passed")
