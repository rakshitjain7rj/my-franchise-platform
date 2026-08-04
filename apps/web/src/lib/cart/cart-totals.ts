/**
 * Single source of truth helpers for cart money + delivery postcode.
 *
 * Charged total (payment truth) is Medusa's cart.total once a shipping method
 * is attached. Free delivery keeps shipping_total at 0 — treat deliverable
 * metadata + explicit delivery_fee (including £0) as authoritative too.
 * Before attach, UI falls back to metadata.delivery_fee — never invent a fee.
 *
 * Delivery postcode lives on shipping_address.postal_code (Medusa) and is
 * mirrored to metadata.delivery_postcode for display / resume.
 */

import type { MedusaCart, MedusaCartItem } from "./cart-actions"
import { DELIVERY_FREE_OVER_GBP as FREE_OVER_DEFAULT } from "@/lib/data/delivery-policy"

export type CartFulfillmentMethod = "pickup" | "delivery"

/** Re-export policy threshold (NEXT_PUBLIC_DELIVERY_FREE_OVER_GBP ?? 150). */
export { DELIVERY_FREE_OVER_GBP } from "@/lib/data/delivery-policy"

export type ResolvedCartTotals = {
  fulfillmentMethod: CartFulfillmentMethod
  subtotal: number
  tax: number
  discount: number
  /** Delivery / pickup charge used for display. */
  shipping: number
  /**
   * Grand total for UI. Equals cart.total when Medusa already includes
   * shipping (including free £0 after attach when totals are final);
   * otherwise cart.total + quoted delivery fee.
   */
  total: number
  /**
   * True when shipping came from cart.shipping_total or a confirmed
   * deliverable quote (including free £0). False only while still hydrating.
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
 * Merchandise after discounts, before tax & delivery (GBP major units).
 *
 * Free-over SSOT shared with backend charge path:
 *  1. Sum line items (subtotal or unit×qty − line discounts) — excludes shipping
 *  2. Else item_subtotal − item_discount_total when present
 *  3. Else cart.subtotal − shipping − discounts (subtotal may include shipping)
 *
 * Never use tax-inclusive item_total. Never treat bare cart.subtotal as
 * merchandise after a delivery method is attached.
 */
export function merchandiseSubtotalForDelivery(
  cart: MedusaCart | null | undefined
): number {
  if (!cart) return 0

  const items = cart.items
  if (Array.isArray(items) && items.length > 0) {
    let sum = 0
    let any = false
    for (const item of items as MedusaCartItem[]) {
      const lineSub = asFiniteNumber(item.subtotal)
      const unit = asFiniteNumber(item.unit_price)
      const qty = asFiniteNumber(item.quantity) ?? 1
      let gross: number | null = lineSub
      if (gross == null && unit != null) {
        gross = unit * qty
      }
      if (gross == null) continue

      const meta = item as MedusaCartItem & {
        discount_subtotal?: number
        discount_total?: number
      }
      const disc =
        asFiniteNumber(meta.discount_subtotal) ??
        asFiniteNumber(meta.discount_total) ??
        0
      sum += Math.max(0, gross - disc)
      any = true
    }
    if (any) return Math.round(sum * 100) / 100
  }

  const cartExt = cart as MedusaCart & {
    item_subtotal?: number
    item_discount_total?: number
    shipping_subtotal?: number
  }
  const itemSub = asFiniteNumber(cartExt.item_subtotal)
  if (itemSub != null) {
    const itemDisc = asFiniteNumber(cartExt.item_discount_total) ?? 0
    return Math.max(0, Math.round((itemSub - itemDisc) * 100) / 100)
  }

  // Last resort: strip shipping from cart.subtotal (includes shipping after attach).
  const sub = asFiniteNumber(cart.subtotal) ?? 0
  const ship =
    asFiniteNumber(cartExt.shipping_subtotal) ??
    asFiniteNumber(cart.shipping_total) ??
    0
  const disc = asFiniteNumber(cart.discount_total) ?? 0
  return Math.max(0, Math.round((sub - ship - disc) * 100) / 100)
}

/** GBP still needed to unlock free delivery by order value. */
export function amountToFreeDelivery(
  merchandiseSubtotal: number,
  freeOverGbp: number = FREE_OVER_DEFAULT
): number {
  if (!Number.isFinite(merchandiseSubtotal)) return freeOverGbp
  return Math.max(
    0,
    Math.round((freeOverGbp - merchandiseSubtotal) * 100) / 100
  )
}

/**
 * True when the cart has a successful backend delivery quote (fee may be £0).
 */
export function isDeliveryQuoteDeliverable(
  cart: MedusaCart | null | undefined
): boolean {
  return cart?.metadata?.delivery_deliverable === true
}

/**
 * Quoted delivery fee from cart metadata (backend logistics quote).
 * Returns 0 when missing, not deliverable, or free (£0).
 * Callers that need to distinguish “free” vs “not quoted” should also check
 * isDeliveryQuoteDeliverable / metadata.delivery_deliverable.
 */
export function getQuotedDeliveryFee(
  cart: MedusaCart | null | undefined
): number {
  if (cart?.metadata?.delivery_deliverable === false) return 0
  const fee = asFiniteNumber(cart?.metadata?.delivery_fee)
  if (fee == null) return 0
  // Allow explicit £0 free delivery when deliverable is true.
  if (fee === 0 && cart?.metadata?.delivery_deliverable === true) return 0
  return fee > 0 ? fee : 0
}

/**
 * Resolve subtotal / shipping / tax / discount / grand total from the cart.
 *
 * Optional `localDeliveryFee` is only for the cart page while a quote is in
 * flight and not yet written back to cart metadata — prefer cart fields.
 * Never overrides a confirmed free (£0 deliverable) quote.
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
  const deliverable = isDeliveryQuoteDeliverable(cart)
  const quotedFee = getQuotedDeliveryFee(cart)
  const localFeeRaw =
    typeof options?.localDeliveryFee === "number" &&
    Number.isFinite(options.localDeliveryFee)
      ? options.localDeliveryFee
      : null

  // Paid Medusa shipping is always truth. Free delivery keeps shipping_total
  // at 0 — treat confirmed deliverable metadata (fee may be £0) as authoritative.
  const shippingIsAuthoritative =
    medusaShipping > 0 ||
    (fulfillmentMethod === "delivery" &&
      deliverable &&
      asFiniteNumber(cart?.metadata?.delivery_fee) != null)

  let shipping = 0
  if (medusaShipping > 0) {
    shipping = medusaShipping
  } else if (fulfillmentMethod === "delivery") {
    if (deliverable && asFiniteNumber(cart?.metadata?.delivery_fee) != null) {
      // Explicit quote including free £0 — do not let a stale local fee win.
      shipping = quotedFee
    } else if (localFeeRaw != null && localFeeRaw > 0) {
      shipping = localFeeRaw
    } else {
      shipping = quotedFee
    }
  }

  // cart.total already includes shipping_total when a method is attached
  // (including £0 free). When shipping is only from metadata quote and not
  // yet in cart.total, add it for display.
  const baseTotal = cart?.total ?? 0
  const shippingAlreadyInTotal = medusaShipping > 0
  const total = Math.max(
    0,
    shippingAlreadyInTotal ? baseTotal : baseTotal + shipping
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
