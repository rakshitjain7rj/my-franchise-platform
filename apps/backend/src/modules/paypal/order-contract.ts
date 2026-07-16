/**
 * Platform PayPal create-order contract.
 *
 * ## Product decision (do not “modernise” away)
 *
 * Cake Break’s storefront uses the **redirect** path. The legacy Smart Buttons
 * branch remains supported by the provider contract only, not by the UI.
 *
 * | Mode            | When                                      | Create-order shape                         | Expected PayPal status   |
 * |-----------------|-------------------------------------------|--------------------------------------------|--------------------------|
 * | smart_buttons   | returnUrl/cancelUrl not both set           | NO `payment_source`; `application_context` | `CREATED` + `approve`    |
 * | redirect        | BOTH returnUrl and cancelUrl configured   | `payment_source.paypal.experience_context` | `PAYER_ACTION_REQUIRED`  |
 *
 * ## Why this exists (regression history)
 *
 * An audit treated deprecated `application_context` as a bug and always sent
 * `payment_source.paypal.experience_context`. Without return/cancel URLs that
 * leaves the order in `PAYER_ACTION_REQUIRED`. The JS SDK then hangs on the
 * button spinner forever after `createOrder` returns the order id.
 *
 * That was not an upstream flake — it was a broken checkout-mode contract.
 * This module is the single source of truth so that migration cannot recur.
 *
 * Amounts are Medusa-native major units (33.05 = £33.05). Formatting only.
 */

import { MedusaError } from "@medusajs/framework/utils"
import {
  CheckoutPaymentIntent,
  OrderApplicationContextShippingPreference,
  OrderApplicationContextUserAction,
  PaypalExperienceUserAction,
  PaypalWalletContextShippingPreference,
  type OrderRequest,
} from "@paypal/paypal-server-sdk"

export type PaypalCheckoutMode = "smart_buttons" | "redirect"

export interface PaypalUrlOptions {
  returnUrl?: string
  cancelUrl?: string
}

/** Smart Buttons unless *both* redirect URLs are present. Partial URLs → smart_buttons. */
export function resolvePaypalCheckoutMode(
  options: PaypalUrlOptions
): PaypalCheckoutMode {
  if (options.returnUrl?.trim() && options.cancelUrl?.trim()) {
    return "redirect"
  }
  return "smart_buttons"
}

/** Formats a monetary value with exactly 2 decimal places (PayPal requirement). */
export function money(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid monetary amount passed to PayPal client: ${String(value)}`
    )
  }
  return n.toFixed(2)
}

export interface BuildCreateOrderBodyInput {
  amount: number | string
  currency: string
  sessionId?: string
  includeProvidedAddress?: boolean
  /** Pre-built purchase-unit items (already formatted) — optional. */
  items?: Array<{
    name: string
    quantity: string
    unitAmount: { currencyCode: string; value: string }
  }>
  shipping?: Record<string, unknown>
  mode: PaypalCheckoutMode
  returnUrl?: string
  cancelUrl?: string
}

/**
 * Builds the Orders v2 create body for the given checkout mode.
 * Pure: no I/O. Callers must use `resolvePaypalCheckoutMode` for `mode`.
 */
export function buildCreateOrderBody(
  input: BuildCreateOrderBodyInput
): OrderRequest {
  const currencyCode = String(input.currency).toUpperCase()
  const orderValue = money(input.amount)

  const items = input.items ?? []
  const itemsSum = items.reduce(
    (sum, item) =>
      sum + Number(item.unitAmount.value) * Number(item.quantity),
    0
  )
  const itemsMatchTotal = items.length > 0 && money(itemsSum) === orderValue

  const shippingPreferenceApp = input.includeProvidedAddress
    ? OrderApplicationContextShippingPreference.SetProvidedAddress
    : OrderApplicationContextShippingPreference.NoShipping

  const shippingPreferenceWallet = input.includeProvidedAddress
    ? PaypalWalletContextShippingPreference.SetProvidedAddress
    : PaypalWalletContextShippingPreference.NoShipping

  const purchaseUnit = {
    amount: {
      currencyCode,
      value: orderValue,
      ...(itemsMatchTotal && {
        breakdown: {
          itemTotal: { currencyCode, value: orderValue },
        },
      }),
    },
    customId: input.sessionId,
    ...(itemsMatchTotal && { items }),
    ...(input.shipping && { shipping: input.shipping }),
  }

  if (input.mode === "redirect") {
    if (!input.returnUrl?.trim() || !input.cancelUrl?.trim()) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Redirect PayPal mode requires both returnUrl and cancelUrl."
      )
    }
    return {
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [purchaseUnit],
      paymentSource: {
        paypal: {
          experienceContext: {
            userAction: PaypalExperienceUserAction.PayNow,
            shippingPreference: shippingPreferenceWallet,
            returnUrl: input.returnUrl,
            cancelUrl: input.cancelUrl,
          },
        },
      },
    }
  }

  // smart_buttons — the storefront path. Never set payment_source.
  return {
    intent: CheckoutPaymentIntent.Capture,
    purchaseUnits: [purchaseUnit],
    applicationContext: {
      userAction: OrderApplicationContextUserAction.PayNow,
      shippingPreference: shippingPreferenceApp,
    },
  }
}

/**
 * Hard contract: Smart Buttons payloads must never include payment_source.
 * Call after build (or in tests) so a future refactor cannot reintroduce the hang.
 */
export function assertSmartButtonsPayload(body: OrderRequest): void {
  if (body.paymentSource != null) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "PayPal Smart Buttons create-order must not set payment_source. " +
        "That yields PAYER_ACTION_REQUIRED and hangs the JS SDK button spinner. " +
        "Use application_context only, or configure both returnUrl and cancelUrl for redirect mode."
    )
  }
  if (!body.applicationContext) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "PayPal Smart Buttons create-order requires application_context " +
        "(user_action / shipping_preference) when payment_source is omitted."
    )
  }
}

export interface PaypalOrderResultLike {
  id?: string
  status?: string
  links?: Array<{ rel?: string; href?: string }>
}

/**
 * Validates the create-order API result matches the checkout mode we intended.
 * Fail closed: a wrong status means the shopper would hang or be mis-routed.
 */
export function assertCreateOrderResultForMode(
  mode: PaypalCheckoutMode,
  result: PaypalOrderResultLike
): void {
  if (!result?.id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "PayPal did not return an order id."
    )
  }

  const status = String(result.status ?? "").toUpperCase()

  if (mode === "smart_buttons") {
    if (status === "PAYER_ACTION_REQUIRED") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "PayPal created a redirect-mode order (PAYER_ACTION_REQUIRED) but this " +
          "platform is configured for Smart Buttons. Check that create-order does " +
          "not send payment_source without returnUrl/cancelUrl."
      )
    }
    // CREATED is the happy path; APPROVED would be unexpected pre-buyer-action.
    if (status && status !== "CREATED") {
      // Soft-allow other non-redirect statuses from sandbox quirks, but never
      // PAYER_ACTION_REQUIRED (handled above). Log-worthy if we add a logger.
    }
    const rels = (result.links ?? []).map((l) => l.rel)
    if (rels.length > 0 && !rels.includes("approve")) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "PayPal Smart Buttons order is missing an approve link. " +
          `Got link rels: [${rels.join(", ")}]. Order status=${status || "unknown"}.`
      )
    }
    return
  }

  // redirect mode — payer-action is expected; approve may still appear.
  if (status === "CREATED" && !(result.links ?? []).some((l) => l.rel === "approve" || l.rel === "payer-action")) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "PayPal redirect-mode order is missing payer-action/approve links."
    )
  }
}

/**
 * Maps line items for the payload; drops them when they do not sum to total
 * (avoids ITEM_TOTAL_MISMATCH 422 from PayPal).
 */
export function mapLineItemsForOrder(input: {
  currency: string
  orderValue: string
  items?: Array<{
    title: string
    quantity: number | string
    unit_price: number | string
  }>
}): {
  items: Array<{
    name: string
    quantity: string
    unitAmount: { currencyCode: string; value: string }
  }>
  itemsMatchTotal: boolean
  droppedMismatch: boolean
} {
  const currencyCode = String(input.currency).toUpperCase()
  const items =
    input.items?.map((item) => ({
      name: item.title,
      quantity: String(item.quantity),
      unitAmount: {
        currencyCode,
        value: money(item.unit_price),
      },
    })) ?? []

  const itemsSum = items.reduce(
    (sum, item) =>
      sum + Number(item.unitAmount.value) * Number(item.quantity),
    0
  )
  const itemsMatchTotal =
    items.length > 0 && money(itemsSum) === input.orderValue

  return {
    items: itemsMatchTotal ? items : [],
    itemsMatchTotal,
    droppedMismatch: items.length > 0 && !itemsMatchTotal,
  }
}
