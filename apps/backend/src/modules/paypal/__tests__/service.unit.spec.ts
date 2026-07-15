/**
 * PayPal provider + order-contract regression suite.
 *
 * These tests encode the product contract: default path is Smart Buttons.
 * A future “migrate application_context → payment_source” PR must fail here
 * unless it also flips to full redirect mode with return+cancel URLs.
 */

import PaypalProviderService from "../service"
import FixedPaypalCoreService, { money } from "../paypal-core"
import {
  assertCreateOrderResultForMode,
  assertSmartButtonsPayload,
  buildCreateOrderBody,
  resolvePaypalCheckoutMode,
} from "../order-contract"

const OPTIONS = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  isSandbox: true,
  includeShippingData: false,
  includeCustomerData: false,
}

function buildService(extra: Record<string, unknown> = {}) {
  const container = {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    paymentModuleService: {},
  }
  const service = new PaypalProviderService(container, {
    ...OPTIONS,
    ...extra,
  })

  const createOrder = jest.fn(async () => ({
    id: "PAYPAL-ORDER-123",
    status: "CREATED",
  }))
  ;(service as any).client = { createOrder }

  return { service, createOrder }
}

function buildCoreClient(
  extraOptions: Record<string, unknown> = {},
  result: Record<string, unknown> = {
    id: "PP-ORDER-9",
    status: "CREATED",
    links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=PP-ORDER-9" }],
  }
) {
  const client = new FixedPaypalCoreService({ ...OPTIONS, ...extraOptions })
  const sdkCreateOrder = jest.fn(async () => ({ result }))
  ;(client as any).ordersController = { createOrder: sdkCreateOrder }
  return { client, sdkCreateOrder }
}

function sentBody(sdkCreateOrder: jest.Mock) {
  return sdkCreateOrder.mock.calls[0][0].body
}

// ─── Checkout mode resolution ───────────────────────────────────────────────

describe("resolvePaypalCheckoutMode", () => {
  it("defaults to smart_buttons (storefront product path)", () => {
    expect(resolvePaypalCheckoutMode({})).toBe("smart_buttons")
  })

  it("stays smart_buttons when only one redirect URL is set", () => {
    expect(
      resolvePaypalCheckoutMode({ returnUrl: "https://example.com/return" })
    ).toBe("smart_buttons")
    expect(
      resolvePaypalCheckoutMode({ cancelUrl: "https://example.com/cancel" })
    ).toBe("smart_buttons")
  })

  it("uses redirect only when both return and cancel URLs are set", () => {
    expect(
      resolvePaypalCheckoutMode({
        returnUrl: "https://example.com/return",
        cancelUrl: "https://example.com/cancel",
      })
    ).toBe("redirect")
  })
})

// ─── Pure payload contract ──────────────────────────────────────────────────

describe("buildCreateOrderBody — Smart Buttons contract", () => {
  it("never sets payment_source in smart_buttons mode", () => {
    const body = buildCreateOrderBody({
      amount: 33,
      currency: "gbp",
      mode: "smart_buttons",
    })
    expect(body.paymentSource).toBeUndefined()
    expect(body.applicationContext).toEqual(
      expect.objectContaining({
        userAction: "PAY_NOW",
        shippingPreference: "NO_SHIPPING",
      })
    )
    // Hard guard used at runtime too.
    expect(() => assertSmartButtonsPayload(body)).not.toThrow()
  })

  it("assertSmartButtonsPayload rejects payment_source (regression lock for BUG-2)", () => {
    const body = buildCreateOrderBody({
      amount: 10,
      currency: "gbp",
      mode: "redirect",
      returnUrl: "https://example.com/return",
      cancelUrl: "https://example.com/cancel",
    })
    expect(body.paymentSource).toBeDefined()
    expect(() => assertSmartButtonsPayload(body)).toThrow(/must not set payment_source/)
  })

  it("redirect mode requires both URLs and sets experience_context", () => {
    expect(() =>
      buildCreateOrderBody({
        amount: 10,
        currency: "gbp",
        mode: "redirect",
      })
    ).toThrow(/returnUrl and cancelUrl/)

    const body = buildCreateOrderBody({
      amount: 10,
      currency: "gbp",
      mode: "redirect",
      returnUrl: "https://cakebreak.example/return",
      cancelUrl: "https://cakebreak.example/cancel",
    })
    expect(body.applicationContext).toBeUndefined()
    expect(body.paymentSource?.paypal?.experienceContext).toEqual(
      expect.objectContaining({
        userAction: "PAY_NOW",
        shippingPreference: "NO_SHIPPING",
        returnUrl: "https://cakebreak.example/return",
        cancelUrl: "https://cakebreak.example/cancel",
      })
    )
  })

  it("formats money to 2 decimals and uppercases currency", () => {
    const body = buildCreateOrderBody({
      amount: 29.700000000000004,
      currency: "gbp",
      mode: "smart_buttons",
    })
    expect(body.purchaseUnits[0].amount).toEqual(
      expect.objectContaining({ value: "29.70", currencyCode: "GBP" })
    )
  })
})

describe("assertCreateOrderResultForMode", () => {
  it("accepts CREATED + approve for smart_buttons", () => {
    expect(() =>
      assertCreateOrderResultForMode("smart_buttons", {
        id: "O-1",
        status: "CREATED",
        links: [{ rel: "approve", href: "https://paypal.com/approve" }],
      })
    ).not.toThrow()
  })

  it("rejects PAYER_ACTION_REQUIRED for smart_buttons (the hang regression)", () => {
    expect(() =>
      assertCreateOrderResultForMode("smart_buttons", {
        id: "O-1",
        status: "PAYER_ACTION_REQUIRED",
        links: [{ rel: "payer-action", href: "https://paypal.com/checkoutnow" }],
      })
    ).toThrow(/redirect-mode order/)
  })

  it("rejects missing approve link when links are present", () => {
    expect(() =>
      assertCreateOrderResultForMode("smart_buttons", {
        id: "O-1",
        status: "CREATED",
        links: [{ rel: "self", href: "https://api.paypal.com/..." }],
      })
    ).toThrow(/missing an approve link/)
  })
})

// ─── money() ────────────────────────────────────────────────────────────────

describe("money()", () => {
  it("always formats to exactly 2 decimal places", () => {
    expect(money(29.700000000000004)).toBe("29.70")
    expect(money(33.1)).toBe("33.10")
    expect(money(33)).toBe("33.00")
    expect(money("12.345")).toBe("12.35")
  })

  it("rejects non-numeric values", () => {
    expect(() => money("not-a-number")).toThrow(/Invalid monetary amount/)
    expect(() => money(undefined)).toThrow(/Invalid monetary amount/)
  })
})

// ─── Core client (SDK boundary) ─────────────────────────────────────────────

describe("FixedPaypalCoreService.createOrder", () => {
  it("is smart_buttons by default and sends application_context only", async () => {
    const { client, sdkCreateOrder } = buildCoreClient()
    expect(client.getCheckoutMode()).toBe("smart_buttons")

    await client.createOrder({ amount: 33, currency: "gbp" })

    const body = sentBody(sdkCreateOrder)
    expect(body.paymentSource).toBeUndefined()
    expect(body.applicationContext).toEqual(
      expect.objectContaining({
        userAction: "PAY_NOW",
        shippingPreference: "NO_SHIPPING",
      })
    )
  })

  it("refuses to return a PAYER_ACTION_REQUIRED order in smart_buttons mode", async () => {
    const { client } = buildCoreClient(
      {},
      {
        id: "O-BAD",
        status: "PAYER_ACTION_REQUIRED",
        links: [{ rel: "payer-action", href: "https://x" }],
      }
    )

    await expect(
      client.createOrder({ amount: 33, currency: "gbp" })
    ).rejects.toThrow(/redirect-mode order/)
  })

  it("uses payment_source only when both redirect URLs are configured", async () => {
    const { client, sdkCreateOrder } = buildCoreClient(
      {
        returnUrl: "https://cakebreak.example/return",
        cancelUrl: "https://cakebreak.example/cancel",
      },
      {
        id: "O-REDIR",
        status: "PAYER_ACTION_REQUIRED",
        links: [{ rel: "payer-action", href: "https://x" }],
      }
    )
    expect(client.getCheckoutMode()).toBe("redirect")

    await client.createOrder({ amount: 10, currency: "gbp" })
    const body = sentBody(sdkCreateOrder)
    expect(body.applicationContext).toBeUndefined()
    expect(body.paymentSource.paypal.experienceContext.returnUrl).toBe(
      "https://cakebreak.example/return"
    )
  })

  it("forwards matching line items and drops mismatches", async () => {
    const match = buildCoreClient()
    await match.client.createOrder({
      amount: 33,
      currency: "gbp",
      items: [{ title: "Victoria Sponge", quantity: 2, unit_price: 16.5 }],
    })
    const unit = sentBody(match.sdkCreateOrder).purchaseUnits[0]
    expect(unit.items).toHaveLength(1)
    expect(unit.amount.breakdown.itemTotal.value).toBe("33.00")

    const mismatch = buildCoreClient()
    await mismatch.client.createOrder({
      amount: 33,
      currency: "gbp",
      items: [{ title: "Victoria Sponge", quantity: 1, unit_price: 16.5 }],
    })
    const unit2 = sentBody(mismatch.sdkCreateOrder).purchaseUnits[0]
    expect(unit2.items).toBeUndefined()
    expect(unit2.amount.breakdown).toBeUndefined()
  })
})

// ─── Medusa provider ────────────────────────────────────────────────────────

describe("PaypalProviderService", () => {
  it("keeps the plugin identifier so the id stays pp_paypal_paypal", () => {
    expect((PaypalProviderService as any).identifier).toBe("paypal")
  })

  it("passes major-unit amounts through unchanged and uppercases currency", async () => {
    const { service, createOrder } = buildService()

    await service.initiatePayment({
      amount: 33,
      currency_code: "gbp",
      data: {},
      context: { idempotency_key: "sess_1" },
    })

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 33, currency: "GBP" })
    )
  })

  it("does NOT rescale fractional amounts (33.05 stays 33.05)", async () => {
    const { service, createOrder } = buildService()

    await service.initiatePayment({
      amount: 33.05,
      currency_code: "gbp",
      data: {},
      context: { idempotency_key: "sess_2" },
    })

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 33.05 })
    )
  })

  it("returns the PayPal order id on the session data for the storefront", async () => {
    const { service } = buildService()

    const result = await service.initiatePayment({
      amount: 33,
      currency_code: "gbp",
      data: {},
      context: { idempotency_key: "sess_3" },
    })

    expect(result.id).toBe("PAYPAL-ORDER-123")
    expect((result.data as any).id).toBe("PAYPAL-ORDER-123")
  })

  it("end-to-end: initiatePayment sends a Smart Buttons payload", async () => {
    const container = {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      paymentModuleService: {},
    }
    const service = new PaypalProviderService(container, OPTIONS)
    const sdkCreateOrder = jest.fn(async () => ({
      result: {
        id: "PP-E2E-1",
        status: "CREATED",
        links: [
          { rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=PP-E2E-1" },
        ],
      },
    }))
    ;((service as any).client as any).ordersController = {
      createOrder: sdkCreateOrder,
    }

    const result = await service.initiatePayment({
      amount: 33.05,
      currency_code: "gbp",
      data: {},
      context: { idempotency_key: "sess_e2e" },
    })

    const body = sentBody(sdkCreateOrder)
    expect(body.purchaseUnits[0].amount).toEqual(
      expect.objectContaining({ value: "33.05", currencyCode: "GBP" })
    )
    expect(body.purchaseUnits[0].customId).toBe("sess_e2e")
    expect(body.paymentSource).toBeUndefined()
    expect(body.applicationContext.userAction).toBe("PAY_NOW")
    expect(result.id).toBe("PP-E2E-1")
  })
})
