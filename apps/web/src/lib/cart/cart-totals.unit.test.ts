/**
 * Lightweight assertions for cart totals / postcode SSOT.
 * Run: npx tsx src/lib/cart/cart-totals.unit.test.ts
 */
import {
  amountToFreeDelivery,
  getCartDeliveryPostcode,
  getCartFulfillmentMethod,
  getQuotedDeliveryFee,
  isDeliveryQuoteDeliverable,
  merchandiseSubtotalForDelivery,
  resolveCartTotals,
} from "./cart-totals"
import type { MedusaCart } from "./cart-actions"

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

function makeCart(partial: Partial<MedusaCart> = {}): MedusaCart {
  return {
    id: "cart_1",
    currency_code: "gbp",
    total: 25,
    subtotal: 25,
    tax_total: 0,
    shipping_total: 0,
    discount_total: 0,
    items: [],
    ...partial,
  }
}

assert(getCartFulfillmentMethod(makeCart()) === "pickup", "default pickup")
assert(
  getCartFulfillmentMethod(
    makeCart({ metadata: { fulfillment_method: "delivery" } })
  ) === "delivery",
  "delivery from metadata"
)

assert(
  getCartDeliveryPostcode(
    makeCart({
      shipping_address: { postal_code: "B21 0AL" },
      metadata: { delivery_postcode: "SW1A 1AA" },
    })
  ) === "B21 0AL",
  "shipping_address wins over metadata"
)

assert(
  getCartDeliveryPostcode(
    makeCart({ metadata: { delivery_postcode: "  SW1A 1AA  " } })
  ) === "SW1A 1AA",
  "metadata delivery_postcode fallback"
)

{
  const totals = resolveCartTotals(
    makeCart({
      total: 31.96,
      subtotal: 25,
      shipping_total: 6.96,
      metadata: {
        fulfillment_method: "delivery",
        delivery_fee: 6.96,
        delivery_postcode: "B69 1AA",
      },
    })
  )
  assert(totals.shipping === 6.96, "shipping_total is authoritative")
  assert(totals.total === 31.96, "grand total uses cart.total when shipping attached")
  assert(totals.shippingIsAuthoritative === true, "shippingIsAuthoritative")
  assert(totals.deliveryPostcode === "B69 1AA", "postcode from cart")
}

{
  // Regression: cart page quoted £6.96 but checkout showed only £25 when
  // shipping_total was still 0 — metadata quote must fill the gap.
  const totals = resolveCartTotals(
    makeCart({
      total: 25,
      subtotal: 25,
      shipping_total: 0,
      metadata: {
        fulfillment_method: "delivery",
        delivery_fee: 6.96,
        delivery_deliverable: true,
        delivery_postcode: "B69 1AA",
      },
    })
  )
  assert(totals.shipping === 6.96, "metadata fee when shipping not attached")
  assert(Math.abs(totals.total - 31.96) < 1e-9, "total = subtotal + quoted fee")
  assert(totals.shippingIsAuthoritative === true, "deliverable quote is authoritative")
}

{
  const totals = resolveCartTotals(
    makeCart({
      total: 25,
      subtotal: 25,
      shipping_total: 0,
      metadata: { fulfillment_method: "delivery" },
    }),
    { localDeliveryFee: 6.96 }
  )
  assert(totals.shipping === 6.96, "local fee while quote hydrates")
  assert(Math.abs(totals.total - 31.96) < 1e-9, "local fee added to total")
}

{
  // Free £0 deliverable must not be overridden by a stale local paid fee.
  const totals = resolveCartTotals(
    makeCart({
      total: 150,
      subtotal: 150,
      shipping_total: 0,
      metadata: {
        fulfillment_method: "delivery",
        delivery_fee: 0,
        delivery_deliverable: true,
        delivery_postcode: "B69 1AA",
      },
    }),
    { localDeliveryFee: 9.88 }
  )
  assert(totals.shipping === 0, "free deliverable beats stale local fee")
  assert(totals.total === 150, "free delivery grand total is merchandise only")
  assert(totals.shippingIsAuthoritative === true, "free quote is authoritative")
}

{
  const totals = resolveCartTotals(
    makeCart({
      total: 25,
      subtotal: 25,
      shipping_total: 0,
      metadata: {
        fulfillment_method: "pickup",
        delivery_fee: 6.96,
      },
    }),
    { localDeliveryFee: 6.96 }
  )
  assert(totals.shipping === 0, "pickup ignores delivery fee")
  assert(totals.total === 25, "pickup total is product only")
}

assert(
  getQuotedDeliveryFee(
    makeCart({
      metadata: { delivery_fee: 6.96, delivery_deliverable: false },
    })
  ) === 0,
  "not deliverable → fee 0"
)

assert(
  getQuotedDeliveryFee(
    makeCart({
      metadata: { delivery_fee: 0, delivery_deliverable: true },
    })
  ) === 0,
  "free deliverable quote → fee 0"
)

assert(
  isDeliveryQuoteDeliverable(
    makeCart({ metadata: { delivery_deliverable: true } })
  ) === true,
  "deliverable flag"
)

// Free-over merchandise: lines win; shipping must not inflate.
assert(
  merchandiseSubtotalForDelivery(
    makeCart({
      subtotal: 160, // includes £9.88 delivery after attach
      shipping_total: 9.88,
      discount_total: 0,
      items: [
        { id: "i1", variant_id: null, product_id: null, title: "A", quantity: 1, unit_price: 100, subtotal: 100, currency_code: "gbp" },
        { id: "i2", variant_id: null, product_id: null, title: "B", quantity: 1, unit_price: 50.12, subtotal: 50.12, currency_code: "gbp" },
      ],
    })
  ) === 150.12,
  "merchandise from lines excludes shipping"
)

assert(
  merchandiseSubtotalForDelivery(
    makeCart({
      subtotal: 145 + 9.88,
      shipping_total: 9.88,
      discount_total: 0,
      items: [],
    })
  ) === 145,
  "last-resort strips shipping_total from cart.subtotal"
)

assert(
  merchandiseSubtotalForDelivery(
    makeCart({
      subtotal: 160,
      discount_total: 20,
      items: [
        {
          id: "i1",
          variant_id: null,
          product_id: null,
          title: "A",
          quantity: 1,
          unit_price: 160,
          subtotal: 160,
          currency_code: "gbp",
          discount_subtotal: 20,
        } as MedusaCart["items"][number] & { discount_subtotal: number },
      ],
    })
  ) === 140,
  "merchandise = line subtotal − line discount"
)

assert(amountToFreeDelivery(40) === 110, "progress to free delivery")
assert(amountToFreeDelivery(150) === 0, "already free by order value")

console.log("cart-totals.unit.test.ts: all assertions passed")
