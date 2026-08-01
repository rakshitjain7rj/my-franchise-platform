/**
 * Lightweight assertions for offline-order helpers.
 * Run: npx tsx src/lib/product/offline-order.unit.test.ts
 */
import {
  buildOfflineWhatsAppPrefill,
  formatOfflinePriceLabel,
  isOfflineOrderProduct,
  offlineOrderCategoryLabels,
  OFFLINE_ORDER_CATEGORY_HANDLES,
} from "./offline-order"

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(
  OFFLINE_ORDER_CATEGORY_HANDLES.includes("icing-cakes"),
  "icing handle"
)
assert(
  OFFLINE_ORDER_CATEGORY_HANDLES.includes("wedding-cakes"),
  "wedding handle"
)

assert(
  !isOfflineOrderProduct({ categories: [{ handle: "birthday-round-cakes" }] }),
  "birthday not offline"
)
assert(
  isOfflineOrderProduct({ categories: [{ handle: "wedding-cakes" }] }),
  "wedding offline"
)
assert(
  isOfflineOrderProduct({ categories: [{ handle: "icing-cakes" }] }),
  "icing offline"
)
assert(
  isOfflineOrderProduct({
    categories: [
      { handle: "birthday-round-cakes" },
      { handle: "wedding-cakes" },
    ],
  }),
  "any offline category → offline"
)
assert(
  isOfflineOrderProduct([
    { handle: "Wedding-Cakes" }, // case-insensitive
  ]),
  "case insensitive handle"
)

const dual = offlineOrderCategoryLabels([
  { handle: "icing-cakes", name: "Icing Cakes" },
  { handle: "wedding-cakes", name: "Wedding Cakes" },
])
assert(dual.length === 2, "both labels")
assert(dual[0].toLowerCase().includes("wedding"), "wedding first")
assert(dual[1].toLowerCase().includes("icing"), "icing second")

assert(
  formatOfflinePriceLabel([
    { calculated_price: { calculated_amount: 40, currency_code: "gbp" } },
  ]) === "£40",
  "single price"
)
assert(
  formatOfflinePriceLabel([
    { calculated_price: { calculated_amount: 40, currency_code: "gbp" } },
    { calculated_price: { calculated_amount: 80, currency_code: "gbp" } },
  ]) === "From £40",
  "from cheapest"
)
assert(formatOfflinePriceLabel([]) === null, "empty variants")

const prefill = buildOfflineWhatsAppPrefill({
  title: "(W1) Tiered Wedding Cake",
  url: "https://example.com/products/w1",
  priceLabel: "From £120",
  categoryLabels: ["Wedding cake", "Icing cake"],
  storeName: "Cake Break Coventry",
})
assert(prefill.includes("(W1) Tiered Wedding Cake"), "title in prefill")
assert(prefill.includes("https://example.com/products/w1"), "url in prefill")
assert(prefill.includes("From £120"), "price in prefill")
assert(prefill.includes("Wedding cake, Icing cake"), "categories in prefill")
assert(prefill.includes("Cake Break Coventry"), "store in prefill")

console.log("offline-order.unit.test.ts: all passed")
