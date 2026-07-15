# Compatibility Audit: `@alphabite/medusa-paypal` v0.2.6

**Audited:** 2026-07-08  
**Sources:** GitHub repo (`alphabite-dev/medusa-paypal` @ `main`), npm registry, PayPal Orders v2 API docs, `@paypal/paypal-server-sdk` 1.0.0 changelog, GitHub Issues, PayPal developer community reports.

---

## 1. Plugin Architecture Summary

| Component | File | Purpose |
|---|---|---|
| Provider entry | `src/providers/paypal/index.ts` | Medusa `ModuleProvider` registration |
| Provider service | `src/providers/paypal/service.ts` | Medusa `AbstractPaymentProvider` impl |
| PayPal core | `src/providers/paypal/paypal-core/paypal-core.ts` | Direct PayPal SDK wrapper (order create/capture/refund) |
| Client-token API | `src/api/store/paypal/client-token/route.ts` | `POST /store/paypal/client-token` endpoint |

**SDK used:** `@paypal/paypal-server-sdk` **1.0.0** (pinned, not `^`).  
**devDependencies / peerDependencies:** all pinned to `@medusajs/*` **2.13.6**.

---

## 2. Confirmed Bugs in v0.2.6 Source

### 🔴 BUG-1 — Decimal Precision: `amount.toString()` instead of `amount.toFixed(2)` *(CONFIRMED — GitHub Issue #7)*

**Evidence:** [GitHub Issue #7 – Tax Precision](https://github.com/alphabite-dev/medusa-paypal/issues/7) filed 2026-05-27:

> *"PayPal rejected any cart whose total had >2 decimal places (which is every CA-taxed cart, since 10.75% × any subtotal rarely lands on whole cents) with `UNPROCESSABLE_ENTITY / DECIMAL_PRECISION`. The bug is upstream in `@alphabite/medusa-paypal` v0.2.6 — `paypal-core.js` sends `amount.toString()` instead of `amount.toFixed(2)`."*

**Impact:** Any cart with a tax or discount that produces a non-integer-cent total (the majority of real-world orders) causes PayPal to reject the Create Order request with `422 UNPROCESSABLE_ENTITY / DECIMAL_PRECISION`. The buyer sees "Pay Now" load, clicks it, and then gets a generic checkout error. **This is almost certainly the root cause of your `genericError` reports.**

**Workaround stated in the issue:** `patch-package` postinstall patch. No fix has been merged into `main` yet (issue is still `Open` as of audit date).

---

### 🔴 BUG-2 — `application_context` Used — PayPal Field is DEPRECATED

**Evidence from `paypal-core.ts` imports:**
```ts
import {
  OrderApplicationContextShippingPreference,
  OrderApplicationContextUserAction,
  // ...
} from "@paypal/paypal-server-sdk";
```

The plugin imports and uses `OrderApplicationContext*` enums/types, placing configuration at the **order root level** (`application_context`). PayPal's Orders v2 API has officially deprecated the top-level `application_context` object. The correct pattern is to nest equivalent settings under `payment_source.{method}.experience_context`.

**Official migration (PayPal docs):**

| Deprecated (plugin uses) | Required now |
|---|---|
| `application_context.shipping_preference` | `payment_source.paypal.experience_context.shipping_preference` |
| `application_context.user_action` | `payment_source.paypal.experience_context.user_action` |
| `application_context.return_url` | `payment_source.paypal.experience_context.return_url` |
| `application_context.cancel_url` | `payment_source.paypal.experience_context.cancel_url` |

**Impact:** Deprecated fields are currently still **accepted** by the sandbox (PayPal does not hard-reject them yet), but:
- Sandbox behaviour may diverge from production silently.
- `return_url` / `cancel_url` cannot be passed at all via the plugin (confirmed by [Issue #3](https://github.com/alphabite-dev/medusa-paypal/issues/3), still `Open`).
- Buyers using the PayPal redirect flow (not card fields) have no safe cancel/return path.

---

### 🟡 BUG-3 — Missing `return_url` / `cancel_url` Configuration

**Evidence:** [GitHub Issue #3](https://github.com/alphabite-dev/medusa-paypal/issues/3) – *"How to pass `return_url` and `cancel_url` into `application_context`?"* – filed 2025-11-03, still **Open**, no response from maintainers.

The plugin options schema (`z.object({...})` in `service.ts`) has no `returnUrl` / `cancelUrl` fields, and `paypal-core.ts` doesn't forward them into the order payload. For card-fields-only integrations this is fine; for any redirect-based PayPal flow it is a hard blocker.

---

### 🟡 BUG-4 — `client-token` Route Checks Wrong Env Variable

**Evidence from `src/api/store/paypal/client-token/route.ts`:**
```ts
const base =
  process.env.PAYPAL_SANDBOX === "true"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
```

The plugin options define the sandbox flag as `isSandbox` (boolean, passed from `medusa.config.ts` as `PAYPAL_IS_SANDBOX`), but the API route hardcodes `process.env.PAYPAL_SANDBOX` (different variable name). If your `.env` only defines `PAYPAL_IS_SANDBOX`, the client-token route silently falls back to **production** PayPal, causing every sandbox client-token request to fail with auth errors.

---

## 3. PayPal Orders v2 API Comparison

| Requirement | Plugin v0.2.6 | Status |
|---|---|---|
| `purchase_units[].amount.value` must be string with exactly 2 decimal places | Sends `amount.toString()` — may be `"12.1000000001"` with tax | ❌ BUG-1 |
| `purchase_units[].amount.currency_code` | ✅ Included | ✅ |
| `intent: "CAPTURE"` | ✅ Set via `CheckoutPaymentIntent` | ✅ |
| `application_context` replaced by `payment_source.*.experience_context` | Uses deprecated `application_context` types | ⚠️ Deprecated |
| `payment_source.card` for Advanced Card Fields | Not set — relies on client-side card fields which is correct for this flow | ✅ (acceptable) |
| `purchase_units[].items[]` breakdown (when items sent) | Optional inclusion (`includeShippingData`) — present in plugin | ✅ |
| `purchase_units[].shipping.address` (when shipping sent) | Gated behind `includeShippingData` option | ✅ |
| `purchase_units[].amount.breakdown` (when items sent) | Present when `includeShippingData=true` | ✅ |
| Decimal precision of `item.unit_amount.value` and `shipping.amount.value` | Same `toString()` bug applies to all sub-amounts | ❌ BUG-1 extends here |

---

## 4. SDK Version Assessment (`@paypal/paypal-server-sdk` 1.0.0)

The plugin uses SDK **v1.0.0** pinned (no caret). This is **the current stable release** as of this audit — not an outdated version. The SDK itself is relatively recent (2024). The problem is **how the plugin uses the SDK**, not the SDK version itself:

- The SDK exports `OrderApplicationContextShippingPreference` and `OrderApplicationContextUserAction` as convenience types — they remain in the SDK for backward compat, but the underlying API fields they map to are **deprecated**.
- The SDK also exports `FulfillmentType` (imported in `paypal-core.ts`) — this is a newer type confirming the SDK is current.

**Verdict:** The SDK version is fine. The bug is in the plugin's own order-construction logic.

---

## 5. GitHub Issues — `Pay Now` → `genericError` Pattern

**No issue titled exactly `genericError` exists in the repository.** However, GitHub Issue #7 describes the exact failure chain:

1. Buyer reaches checkout, sees card fields render correctly ("Pay Now" button visible).
2. Buyer clicks "Pay Now" → `cardFieldsForm.submit()` fires → plugin's `createOrder` is called.
3. `createOrder` calls `initiatePaymentSession` → backend calls PayPal Create Order.
4. PayPal rejects with `422 UNPROCESSABLE_ENTITY / DECIMAL_PRECISION` because `amount.value` has >2 decimal places.
5. The PayPal SDK's `onError` fires in the iframe with `CARD_GENERIC_ERROR` — this surfaces as "Something went wrong" or a generic error to the buyer.

This is not a theoretical chain — it is the exact sequence documented in Issue #7.

---

## 6. Comparison vs Official PayPal Server-Side Create Order Example

**Official PayPal recommended payload (2024+):**
```json
{
  "intent": "CAPTURE",
  "purchase_units": [{
    "amount": {
      "currency_code": "USD",
      "value": "100.00"
    }
  }],
  "payment_source": {
    "paypal": {
      "experience_context": {
        "user_action": "PAY_NOW",
        "return_url": "https://example.com/return",
        "cancel_url": "https://example.com/cancel"
      }
    }
  }
}
```

**What `@alphabite/medusa-paypal` v0.2.6 sends:**
```json
{
  "intent": "CAPTURE",
  "purchase_units": [{
    "amount": {
      "currency_code": "USD",
      "value": "100.10000000001"  ← BUG-1: toString() not toFixed(2)
    }
  }],
  "application_context": {         ← BUG-2: deprecated top-level field
    "shipping_preference": "...",
    "user_action": "PAY_NOW"
  }
  // No payment_source.*.experience_context
  // No return_url / cancel_url (BUG-3)
}
```

---

## 7. Compatibility Verdicts

### Medusa 2.15.x

| Check | Result |
|---|---|
| Plugin was built against Medusa **2.13.6** (pinned in devDeps/peerDeps) | ⚠️ |
| Medusa `AbstractPaymentProvider` interface used correctly | ✅ |
| `initiatePayment`, `capturePayment`, `refundPayment`, `cancelPayment` all implemented | ✅ |
| `getPaymentStatus` implemented | ✅ |
| Webhook handler present | ✅ |
| Medusa 2.15 introduced no known breaking changes to the payment provider interface (based on changelog) | ✅ |
| **Overall for Medusa 2.15.x** | ⚠️ **Likely works structurally, but was built/tested on 2.13.6. Monitor for payment module API drift.** |

---

### `@paypal/react-paypal-js` 10.x

| Check | Result |
|---|---|
| Plugin uses `PayPalCardFieldsProvider` / `PayPalCardFieldsForm` (recommended in README) | ✅ Correct components |
| `createOrder` callback returns `order_id` (from `initiatePaymentSession` → `session.data.id`) | ✅ Documented correctly |
| `dataClientToken` required by `PayPalScriptProvider` — provided via `/store/paypal/client-token` | ✅ Route exists |
| `components: "card-fields"` must be set in script options | ✅ Shown in README example |
| `onApprove` calls backend `placeOrder` | ✅ |
| `onError` handling in storefront component | ⚠️ README example has no `onError` handler — errors from BUG-1 may be swallowed silently |
| **Overall for @paypal/react-paypal-js 10.x** | ⚠️ **Frontend integration pattern is correct, but BUG-1 causes silent `genericError` in `onError` with no user-visible message unless you add `onError` handling.** |

---

### PayPal Sandbox Checkout (Current)

| Check | Result |
|---|---|
| Sandbox credential setup (client ID / secret) | ✅ |
| Client token endpoint reachable | ⚠️ Uses wrong env var (`PAYPAL_SANDBOX` vs `PAYPAL_IS_SANDBOX`) — BUG-4 |
| Create Order payload accepted by sandbox | ❌ Fails with `DECIMAL_PRECISION` for any non-integer-cent total |
| `application_context` accepted by sandbox | ⚠️ Still accepted (deprecated, not rejected yet) |
| Capture flow | ⚠️ Never reached due to BUG-1 |
| **Overall for Sandbox** | ❌ **Sandbox checkout will fail for any cart whose sub-total × tax rate is not an exact integer number of cents (i.e., virtually all real carts).** |

---

## 8. Action Items (Priority Order)

| Priority | Action |
|---|---|
| 🔴 P0 | **Apply the `patch-package` fix for BUG-1.** All monetary values must be formatted with `toFixed(2)` before being sent to PayPal. Affects `amount.value`, `item.unit_amount.value`, `breakdown.*`, and `shipping.amount.value`. |
| 🔴 P0 | **Fix BUG-4 — env var mismatch.** Change the client-token route to read `process.env.PAYPAL_IS_SANDBOX` (or, better, inject the options object rather than reading env directly). |
| 🟡 P1 | **Migrate from `application_context` to `payment_source.*.experience_context`** to align with the current PayPal API and unblock `return_url`/`cancel_url` (BUG-2 + BUG-3). |
| 🟢 P2 | **Add `onError` to your `PayPalCardFieldsProvider`** in the frontend so that `CARD_GENERIC_ERROR` / `DECIMAL_PRECISION` is surfaced to the user rather than being a silent no-op. |
| 🟢 P2 | **Pin plugin to a version that actually targets Medusa 2.15** once the maintainers release one, or contribute the above patches upstream. |

---

## 9. Known Issues Summary

| # | Title | Status | Severity |
|---|---|---|---|
| #7 | Tax Precision (`amount.toString()` → `DECIMAL_PRECISION`) | 🔴 Open | Critical |
| #3 | No `return_url` / `cancel_url` support | 🟡 Open | Medium |
| #1 | ERESOLVE peer dep conflict | 🟡 Open | Low (install-time only) |
| BUG-4 | Env var mismatch in client-token route | Not filed | High |

---

## 10. Remediation Status

All fixes live under `apps/backend/src/modules/paypal/` (platform-owned
provider). Create-order semantics are **not** a thin patch of alphabite —
they are defined in `order-contract.ts` (see module `README.md`).

| Bug | Status | Fix |
|---|---|---|
| BUG-1 (decimal precision) | ✅ Fixed | Every monetary value goes through `money()` → `toFixed(2)`. Pinned by unit tests. |
| BUG-2 (deprecated `application_context`) | ⚠️ **Corrected 2026-07-14** | Blind migration to always use `payment_source.paypal.experience_context` **broke Smart Buttons** (orders became `PAYER_ACTION_REQUIRED`; JS SDK spinner hung forever). **Product path is Smart Buttons**: default create-order uses `application_context` only (still accepted by PayPal) and **must not** set `payment_source`. Redirect mode uses `payment_source` **only when both** `returnUrl` and `cancelUrl` are configured. Contract is enforced in `order-contract.ts` + unit tests. |
| BUG-3 (no return/cancel URLs) | ✅ Fixed | Optional `returnUrl` / `cancelUrl`; both required to enter redirect mode. Storefront leaves them unset. |
| BUG-4 (client-token route env var) | ✅ Mitigated (moot here) | Provider-only registration; `PAYPAL_SANDBOX` set alongside `PAYPAL_IS_SANDBOX`. |
| P2 (frontend `onError`) | ✅ Covered | Smart Buttons + `onError`; storefront also rejects `PAYER_ACTION_REQUIRED` sessions via `extractSmartButtonsOrderId`. |
| P2 (Medusa 2.15 targeting) | ⏳ Upstream | Plugin still pins 2.13.6 peers. |

**Do not re-open BUG-2 as “always use payment_source.”** That is a checkout-mode change, not a deprecation cleanup. See `order-contract.ts`.

**Extra hardening:**
- `currency_code` uppercased (Medusa `"gbp"` → PayPal `"GBP"`).
- Line items forwarded only when they sum exactly to the order total.
- Runtime assert: Smart Buttons payload has no `payment_source`; result must not be `PAYER_ACTION_REQUIRED` and should expose an `approve` link.
- `@paypal/paypal-server-sdk` pinned for enum/payload stability.

**Coverage:** `src/modules/paypal/__tests__/service.unit.spec.ts` — mode resolution, pure payload contract, response guards (including hang regression), provider e2e payload.

---

## 11. Update (2026-07-09): platform migrated to Medusa-native major units

The minor-units price convention that necessitated the provider's ÷100
conversion was retired platform-wide:

- `src/scripts/migrate-amounts-to-major-units.ts` divided every stored money
  value (numeric + `raw_*` jsonb twins, 23 columns across price/cart/order/
  payment tables, plus `order_summary.totals`) by 100, guarded by an
  idempotency marker in `store.metadata.amount_unit_convention`.
- Every storefront ÷100 formatter was removed; seed scripts now write major
  units.
- The provider module was renamed `src/modules/paypal_minor_units` →
  `src/modules/paypal` and no longer converts units — amounts pass through
  verbatim (Medusa 33.05 → PayPal "33.05"). Payload ownership lives in
  `order-contract.ts` (Smart Buttons default; see §10 BUG-2 correction).

Admin, storefront and PayPal now agree: admin `33.00` = storefront `£33.00` =
PayPal `£33.00`.

---

## 12. Platform ownership (2026-07-14) — not a patch layer

| Layer | Responsibility |
|-------|----------------|
| `order-contract.ts` | Single source of truth for checkout mode + create-order body + response asserts |
| `paypal-core.ts` | Orders client; uses contract then SDK; fail-closed on wrong mode |
| `service.ts` | Medusa provider; currency uppercase; never alphabite createOrder |
| Storefront | Smart Buttons only; `extractSmartButtonsOrderId` rejects redirect-mode sessions |
| Alphabite package | Capture/authorize/refund plumbing only |

Regression lock: unit test
`rejects PAYER_ACTION_REQUIRED for smart_buttons (the hang regression)`.
