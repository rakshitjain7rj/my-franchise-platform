/**
 * Platform-owned PayPal Orders client.
 *
 * Extends @alphabite/medusa-paypal’s core only for shared auth/SDK wiring
 * (capture, retrieve, refund helpers). **Create-order is fully owned here**
 * via `./order-contract` — do not reintroduce upstream createOrder behaviour.
 *
 * See `./order-contract.ts` for the Smart Buttons vs redirect contract.
 */

import { MedusaError } from "@medusajs/framework/utils"
import { FulfillmentType } from "@paypal/paypal-server-sdk"
// Untyped subpath import (the plugin's .d.ts map only covers its root).
import { PaypalService } from "@alphabite/medusa-paypal/providers/paypal/paypal-core"

import {
  assertCreateOrderResultForMode,
  assertSmartButtonsPayload,
  buildCreateOrderBody,
  mapLineItemsForOrder,
  money,
  resolvePaypalCheckoutMode,
  type PaypalCheckoutMode,
} from "./order-contract"

export { money, resolvePaypalCheckoutMode }
export type { PaypalCheckoutMode }

interface CreateOrderInput {
  /** Major units (Medusa-native). */
  amount: number | string
  currency: string
  sessionId?: string
  shipping_info?: Record<string, unknown>
  items?: Array<{
    title: string
    quantity: number | string
    /** Major units (Medusa-native). */
    unit_price: number | string
  }>
  email?: string
}

export interface FixedPaypalCoreOptions {
  clientId: string
  clientSecret: string
  isSandbox?: boolean
  webhookId?: string
  includeShippingData?: boolean
  includeCustomerData?: boolean
  /**
   * Redirect-mode only. Both must be set to leave Smart Buttons mode.
   * Storefront uses Smart Buttons and does not set these.
   */
  returnUrl?: string
  cancelUrl?: string
}

const BasePaypalCoreService = PaypalService as new (options: any) => any

class FixedPaypalCoreService extends BasePaypalCoreService {
  private readonly returnUrl?: string
  private readonly cancelUrl?: string
  private readonly checkoutMode: PaypalCheckoutMode

  constructor(options: FixedPaypalCoreOptions) {
    super(options)
    this.returnUrl = options.returnUrl
    this.cancelUrl = options.cancelUrl
    this.checkoutMode = resolvePaypalCheckoutMode({
      returnUrl: options.returnUrl,
      cancelUrl: options.cancelUrl,
    })
  }

  /** Exposed for tests / diagnostics — which mode this client instance uses. */
  getCheckoutMode(): PaypalCheckoutMode {
    return this.checkoutMode
  }

  async createOrder({
    amount,
    currency,
    sessionId,
    shipping_info,
    items,
    email,
  }: CreateOrderInput) {
    const currencyCode = String(currency).toUpperCase()
    const orderValue = money(amount)

    const { items: paypalItems, itemsMatchTotal, droppedMismatch } =
      mapLineItemsForOrder({
        currency: currencyCode,
        orderValue,
        items,
      })

    if (droppedMismatch) {
      this.logger?.warn?.(
        `[paypal] Line items do not sum to the order total (${orderValue}); ` +
          `sending amount-only PayPal order to avoid ITEM_TOTAL_MISMATCH.`
      )
    }

    const shippingData = !!shipping_info && {
      ...(this.includeCustomerData &&
        this.mapCustomerData({ email, shipping_info })),
      ...(this.includeShippingData && this.mapShippingData(shipping_info)),
      type: FulfillmentType.Shipping,
    }

    const includeProvidedAddress = Boolean(
      this.includeShippingData && shippingData
    )

    const body = buildCreateOrderBody({
      amount,
      currency: currencyCode,
      sessionId,
      includeProvidedAddress,
      items: itemsMatchTotal ? paypalItems : undefined,
      shipping: shippingData || undefined,
      mode: this.checkoutMode,
      returnUrl: this.returnUrl,
      cancelUrl: this.cancelUrl,
    })

    // Fail closed before hitting PayPal if the body violates Smart Buttons.
    if (this.checkoutMode === "smart_buttons") {
      assertSmartButtonsPayload(body)
    }

    const createdOrder = await this.ordersController.createOrder({ body })
    const result = createdOrder?.result

    if (!result?.id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Failed to create PayPal order"
      )
    }

    // Fail closed on wrong mode so the storefront never receives a hang-prone order.
    assertCreateOrderResultForMode(this.checkoutMode, result)

    return result
  }
}

export default FixedPaypalCoreService
