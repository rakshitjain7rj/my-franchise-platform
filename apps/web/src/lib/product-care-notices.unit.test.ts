/**
 * Run: npx tsx src/lib/product-care-notices.unit.test.ts
 * (from apps/web)
 */

import {
  getProductCareNotices,
  isChocolateCareProduct,
  isPhotoCakeProduct,
  PHOTO_CAKE_CARE,
  CHOCOLATE_CAKE_CARE,
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

assert(
  isChocolateCareProduct({ title: "Chocolate Drip Celebration" }),
  "chocolate drip title"
)

assert(
  isChocolateCareProduct({ metadata: { has_chocolate: "true" }, title: "Plain" }),
  "has_chocolate flag"
)

assert(
  !isChocolateCareProduct({
    metadata: { has_chocolate: false },
    title: "Chocolate Looking Name",
  }),
  "explicit false wins over title"
)

assert(
  !isChocolateCareProduct({ title: "Lemon Sunshine Cake", handle: "lemon" }),
  "lemon is not chocolate"
)

const both = getProductCareNotices({
  title: "Chocolate Photo Cake",
  collection: { handle: "photo-cake" },
})
assert(both.length === 2, "photo + chocolate")
assert(both[0].kind === PHOTO_CAKE_CARE.kind, "photo first")
assert(both[1].kind === CHOCOLATE_CAKE_CARE.kind, "chocolate second")

console.log("product-care-notices.unit.test.ts: all passed")
