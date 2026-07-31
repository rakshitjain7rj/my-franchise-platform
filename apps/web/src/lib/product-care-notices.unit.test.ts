/**
 * Run: npx tsx src/lib/product-care-notices.unit.test.ts
 * (from apps/web)
 */

import {
  getProductCareNotices,
  isPhotoCakeProduct,
  PHOTO_CAKE_CARE,
  PRODUCT_ACCESSORIES_NOTE,
} from "./product-care-notices"

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(
  isPhotoCakeProduct({
    metadata: { supports_photo_upload: true },
    title: "Birthday Cake",
  }),
  "metadata supports_photo_upload"
)

assert(
  isPhotoCakeProduct({
    collection: { handle: "photo-cake", title: "Photo Cakes" },
    title: "Custom Print",
  }),
  "photo collection"
)

assert(
  isPhotoCakeProduct({
    categories: [{ handle: "photo-cake", name: "Photo Cakes" }],
    title: "Print Cake",
  }),
  "photo category"
)

assert(
  !isPhotoCakeProduct({ title: "Vanilla Round Cake", handle: "vanilla-round" }),
  "plain cake is not photo"
)

const photoOnly = getProductCareNotices({
  title: "Chocolate Photo Cake",
  collection: { handle: "photo-cake" },
})
assert(photoOnly.length === 1, "photo only — no chocolate care")
assert(photoOnly[0].kind === PHOTO_CAKE_CARE.kind, "photo notice")

const plain = getProductCareNotices({
  title: "Chocolate Drip Celebration",
  handle: "choc-drip",
})
assert(plain.length === 0, "chocolate cakes get no special care card")

assert(
  /accessories/i.test(PRODUCT_ACCESSORIES_NOTE) &&
    /differ|different|may/i.test(PRODUCT_ACCESSORIES_NOTE),
  "accessories note present for all cakes"
)

console.log("product-care-notices.unit.test.ts: all passed")
