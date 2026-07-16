# PayPal payment provider (`pp_paypal_paypal`)

## Product contract

**Storefront uses a full-page PayPal redirect only.**

| | Smart Buttons (legacy provider mode) | Redirect (Cake Break checkout) |
|--|-------------------------|---------------------|
| Config | Legacy provider-only mode | **Both** env vars set (required by this storefront) |
| Create-order body | `application_context` only — **never** `payment_source` | `payment_source.paypal.experience_context` + URLs |
| PayPal order status | `CREATED` + `approve` link | `PAYER_ACTION_REQUIRED` + `payer-action` |
| UI | Not used by Cake Break | Full-page redirect |

## Do not regress

Sending `payment_source.paypal` **without** return/cancel URLs produces
`PAYER_ACTION_REQUIRED`. The JS SDK then **hangs on the button spinner** after
`createOrder` returns. That was a self-inflicted “deprecation cleanup” once —
guards live in `order-contract.ts` so it cannot ship again silently.

## Source of truth

| File | Role |
|------|------|
| `order-contract.ts` | Mode resolution, payload build, response assertions (pure) |
| `paypal-core.ts` | Orders client; calls contract then PayPal SDK |
| `service.ts` | Medusa provider entry; currency uppercase; swaps client |
| `__tests__/service.unit.spec.ts` | Contract + provider regression suite |

## Alphabite dependency

We keep `@alphabite/medusa-paypal` for AbstractPaymentProvider methods
(capture/authorize/refund) and SDK client wiring. **We do not use its
`createOrder`.** Prefer fixing `order-contract` over “aligning with upstream.”
