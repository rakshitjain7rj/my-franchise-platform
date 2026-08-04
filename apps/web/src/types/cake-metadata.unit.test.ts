/**
 * Lightweight assertions for cake metadata contracts.
 * Run: npx tsx src/types/cake-metadata.unit.test.ts
 */
import {
  buildCustomAttributes,
  collectionSlotToCartMetadata,
  extractSlotStartTime,
  getCartMetadataCollectionSlot,
  getLineCollectionSlot,
  isFlavourOptionTitle,
  isFulfillmentOptionTitle,
  productHasCakeCategory,
  productHasCakeWord,
  productLooksLikeCupcake,
  productMatchesJamDenyPattern,
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

// --- Jam: cake-word / deny / category helpers ---

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
  productHasCakeWord({ title: "Birthday Cake", handle: "birthday-cake" }),
  "cake word on title/handle"
)
assert(
  !productHasCakeWord({ title: "Chocolate Cupcakes" }),
  "cupcakes is not cake word boundary"
)
assert(
  productHasCakeCategory([{ handle: "round-cakes" }]),
  "round-cakes is cake category"
)
assert(
  productHasCakeCategory([{ handle: "photo-cake" }]),
  "photo-cake is cake category"
)
assert(
  !productHasCakeCategory([{ handle: "cupcakes-slices-and-extras" }]),
  "extras category excluded"
)
assert(
  !productHasCakeCategory([{ handle: "christmas" }]),
  "seasonal without cake does not grant"
)
assert(
  productMatchesJamDenyPattern({ title: "Cake Slice" }),
  "slice deny"
)
assert(
  productMatchesJamDenyPattern({ title: "Lemon Drizzle Loaf" }),
  "loaf deny"
)

// --- supportsJamFilling (opt-in cakes only) ---

assert(
  supportsJamFilling({ title: "Birthday Cake", handle: "birthday-cake" }),
  "full cake → jam"
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
  !supportsJamFilling({ title: "Cake Slice", handle: "cake-slice" }),
  "cake slice → no jam (deny wins)"
)
assert(
  !supportsJamFilling({ title: "Something Cake Slice" }),
  "cake + slice → deny wins over cake word"
)
assert(
  !supportsJamFilling({ title: "Giant Cookie" }),
  "cookie → no jam"
)
assert(
  !supportsJamFilling({ title: "Chocolate Bouquet" }),
  "bouquet → no jam"
)
assert(
  !supportsJamFilling({ title: "Lemon Drizzle Loaf" }),
  "loaf → no jam"
)
assert(
  !supportsJamFilling({
    title: "(Ex57) Diwali Cake Box",
    handle: "diwali-cake-box-ex57",
    categories: [{ handle: "diwali-cakes" }],
  }),
  "cake box title/handle → no jam (deny wins over cake word + category)"
)
assert(
  !supportsJamFilling({ title: "Personalized Diwali Cake Box" }),
  "cake box (plural-safe) → no jam"
)
assert(
  supportsJamFilling({
    title: "Red Velvet Symphony",
    categories: [{ handle: "round-cakes" }],
  }),
  "no cake word but cake category → jam"
)
assert(
  !supportsJamFilling({ title: "Red Velvet Symphony" }),
  "no cake word, no categories → no jam"
)
assert(
  !supportsJamFilling({
    title: "Festive Treat",
    categories: [{ handle: "christmas" }],
  }),
  "seasonal category alone → no jam"
)
assert(
  supportsJamFilling({
    title: "Photo Print",
    categories: [{ handle: "photo-cake" }],
  }),
  "photo-cake category → jam"
)
assert(
  !supportsJamFilling({
    title: "Vanilla Box",
    categories: [{ handle: "cupcakes-slices-and-extras" }],
  }),
  "extras category alone → no jam"
)
assert(
  supportsJamFilling({
    title: "Chocolate Cupcakes",
    metadata: { supports_jam_filling: true },
  }),
  "explicit true overrides deny"
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

const fromCartMeta = getCartMetadataCollectionSlot({
  requested_pickup_date: "2026-08-01",
  requested_pickup_time: "14:00",
  requested_pickup_label: "14:00 – 14:30",
})
assert(fromCartMeta?.date === "2026-08-01", "cart meta date")
assert(fromCartMeta?.time === "14:00", "cart meta time")
assert(fromCartMeta?.label === "14:00 – 14:30", "cart meta label")
assert(getCartMetadataCollectionSlot({}) == null, "empty cart meta → null")

console.log("cake-metadata.unit.test.ts: all passed")
