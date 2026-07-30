/**
 * Lightweight assertions for cake metadata contracts.
 * Run: npx tsx src/types/cake-metadata.unit.test.ts
 */
import {
  buildCustomAttributes,
  collectionSlotToCartMetadata,
  extractSlotStartTime,
  getLineCollectionSlot,
  isFlavourOptionTitle,
  isFulfillmentOptionTitle,
  productLooksLikeCupcake,
  resolveSupportedFlavours,
  supportsJamFilling,
} from "./cake-metadata"

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(isFulfillmentOptionTitle("Delivery Method"), "Delivery Method is fulfillment option")
assert(isFulfillmentOptionTitle("fulfillment"), "fulfillment is fulfillment option")
assert(!isFulfillmentOptionTitle("Size"), "Size is not fulfillment option")

assert(isFlavourOptionTitle("Flavour"), "Flavour is flavour option")
assert(isFlavourOptionTitle("Flavor"), "Flavor is flavour option")
assert(isFlavourOptionTitle("Sponge"), "Sponge is flavour option")
assert(isFlavourOptionTitle("Sponge Flavour"), "Sponge Flavour is flavour option")
assert(!isFlavourOptionTitle("Size"), "Size is not flavour option")
assert(
  resolveSupportedFlavours({
    options: [
      {
        title: "Sponge",
        values: [
          { value: "Victoria Sponge" },
          { value: "Chocolate Sponge" },
        ],
      },
    ],
    metadata: {
      supported_flavours: JSON.stringify(["Should not win"]),
    },
  }).join(",") === "Victoria Sponge,Chocolate Sponge",
  "Sponge product option wins over supported_flavours metadata"
)

assert(
  productLooksLikeCupcake({ title: "Chocolate Cupcakes" }),
  "title cupcake heuristic"
)
assert(
  productLooksLikeCupcake({ handle: "vanilla-cupcake-box" }),
  "handle cupcake heuristic"
)
assert(
  !productLooksLikeCupcake({ title: "Birthday Cake", handle: "birthday-cake" }),
  "full cake is not cupcake"
)

assert(
  !supportsJamFilling({ title: "Chocolate Cupcakes" }),
  "cupcake title → no jam"
)
assert(
  !supportsJamFilling({ handle: "vanilla-cupcake-box" }),
  "cupcake handle → no jam"
)
assert(
  supportsJamFilling({ title: "Birthday Cake", handle: "birthday-cake" }),
  "full cake → jam by default"
)
assert(
  supportsJamFilling({
    title: "Chocolate Cupcakes",
    metadata: { supports_jam_filling: true },
  }),
  "explicit true overrides cupcake heuristic"
)
assert(
  !supportsJamFilling({
    title: "Birthday Cake",
    metadata: { supports_jam_filling: false },
  }),
  "explicit false overrides cake"
)
assert(
  !supportsJamFilling({
    title: "Birthday Cake",
    metadata: { supports_jam_filling: "false" },
  }),
  "string false overrides cake"
)

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

const attrsNoJam = buildCustomAttributes({
  date: "2026-07-20",
  time: "12:30 – 13:00",
  jam: undefined,
})
assert(!("jam" in attrsNoJam), "omit jam when undefined")

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
