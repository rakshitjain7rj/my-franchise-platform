/**
 * Single source of truth helpers for cart money + delivery postcode.
 *
 * Charged total (payment truth) is Medusa's cart.total once a shipping method
 * is attached (cart.shipping_total > 0). Before that, UI may fall back to the
 * backend logistics quote stored on cart.metadata.delivery_fee — never a
 * hard-coded client fee.
 *
 * Delivery postcode lives on shipping_address.postal_code (Medusa) and is
 * mirrored to metadata.delivery_postcode for display / resume. Prefer either
 * over the address book when present so cart → checkout cannot drift.
 */

import type { MedusaCart } from "./cart-actions"

export type CartFulfillmentMethod = "pickup" | "delivery"

export type ResolvedCartTotals = {
  fulfillmentMethod: CartFulfillmentMethod
  subtotal: number
  tax: number
  discount: number
  /** Delivery / pickup charge used for display. */
  shipping: number
  /**
   * Grand total for UI. Equals cart.total when Medusa already includes
   * shipping; otherwise cart.total + quoted delivery fee.
   */
  total: number
  /**
   * True when shipping came from cart.shipping_total (Medusa charge path).
   * False when falling back to metadata.delivery_fee.
   */
  shippingIsAuthoritative: boolean
  deliveryPostcode: string | null
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Cart-level fulfillment: metadata wins; default pickup when unset. */
export function getCartFulfillmentMethod(
  cart: MedusaCart | null | undefined
): CartFulfillmentMethod {
  return cart?.metadata?.fulfillment_method === "delivery"
    ? "delivery"
    : "pickup"
}

/**
 * Canonical delivery postcode for this cart.
 * Prefer Medusa shipping address (used by fulfillment calculatePrice), then
 * the mirrored metadata key written by the cart quote step.
 */
export function getCartDeliveryPostcode(
  cart: MedusaCart | null | undefined
): string | null {
  const fromAddress = cart?.shipping_address?.postal_code?.trim()
  if (fromAddress) return fromAddress

  const fromMeta = cart?.metadata?.delivery_postcode
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.trim()
  }

  return null
}

/**
 * Quoted delivery fee from cart metadata (backend logistics quote).
 * Returns 0 when missing / not deliverable.
 */
export function getQuotedDeliveryFee(
  cart: MedusaCart | null | undefined
): number {
  if (cart?.metadata?.delivery_deliverable === false) return 0
  const fee = asFiniteNumber(cart?.metadata?.delivery_fee)
  return fee != null && fee > 0 ? fee : 0
}

/**
 * Resolve subtotal / shipping / tax / discount / grand total from the cart.
 *
 * Optional `localDeliveryFee` is only for the cart page while a quote is in
 * flight and not yet written back to cart metadata — prefer cart fields.
 */
export function resolveCartTotals(
  cart: MedusaCart | null | undefined,
  options?: { localDeliveryFee?: number | null }
): ResolvedCartTotals {
  const fulfillmentMethod = getCartFulfillmentMethod(cart)
  const subtotal = cart?.subtotal ?? 0
  const tax = cart?.tax_total ?? 0
  const discount = cart?.discount_total ?? 0
  const medusaShipping = cart?.shipping_total ?? 0
  const quotedFee = getQuotedDeliveryFee(cart)
  const localFee =
    typeof options?.localDeliveryFee === "number" &&
    Number.isFinite(options.localDeliveryFee) &&
    options.localDeliveryFee > 0
      ? options.localDeliveryFee
      : 0

  const shippingIsAuthoritative = medusaShipping > 0
  let shipping = 0
  if (shippingIsAuthoritative) {
    shipping = medusaShipping
  } else if (fulfillmentMethod === "delivery") {
    shipping = quotedFee > 0 ? quotedFee : localFee
  }

  // cart.total already includes shipping_total when a method is attached.
  // When it is not, add the quoted fee so cart and checkout match.
  const baseTotal = cart?.total ?? 0
  const total = Math.max(
    0,
    shippingIsAuthoritative ? baseTotal : baseTotal + shipping
  )

  return {
    fulfillmentMethod,
    subtotal,
    tax,
    discount,
    shipping,
    total,
    shippingIsAuthoritative,
    deliveryPostcode: getCartDeliveryPostcode(cart),
  }
}
