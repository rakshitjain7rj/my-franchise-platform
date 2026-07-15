# PayPal payment provider (`pp_paypal_paypal`)

## Product contract

**Storefront uses PayPal Smart Buttons (popup) only.**

| | Smart Buttons (default) | Redirect (optional) |
|--|-------------------------|---------------------|
| Config | No `PAYPAL_RETURN_URL` / `PAYPAL_CANCEL_URL` (or only one set) | **Both** env vars set |
| Create-order body | `application_context` only — **never** `payment_source` | `payment_source.paypal.experience_context` + URLs |
| PayPal order status | `CREATED` + `approve` link | `PAYER_ACTION_REQUIRED` + `payer-action` |
| UI | `@paypal/react-paypal-js` buttons | Full-page redirect |

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
