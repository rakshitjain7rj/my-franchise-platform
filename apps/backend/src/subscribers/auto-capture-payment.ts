/**
 * auto-capture-payment.ts — Subscriber on `order.placed`
 *
 * Automatically captures the payment for every newly placed order so that
 * merchants never have to click "Capture" manually in the Medusa admin.
 *
 * Why this is needed
 * ──────────────────
 * Medusa v2's payment flow is intentionally two-phase:
 *
 *   1. `authorizePayment` — called by `completeCartWorkflow` when the cart is
 *      completed. The PayPal provider captures the PayPal order at this point
 *      and returns status AUTHORIZED.  From Medusa's perspective the payment is
 *      only *authorised*, not *captured*.
 *
 *   2. `capturePayment`   — normally triggered manually by an admin via the
 *      dashboard or Admin API.  Until this step runs, the order shows as
 *      "Payment pending" and the payout to the business PayPal account may not
 *      fully settle.
 *
 * For a same-day bakery operation money should settle immediately.  This
 * subscriber bridges the gap by running Medusa's built-in
 * `capturePaymentWorkflow` for every payment that is in AUTHORIZED state right
 * after the order is created.
 *
 * PayPal double-capture guard
 * ───────────────────────────
 * The `alphabite/medusa-paypal` `capturePayment` implementation checks
 * `input.data.status === "CAPTURED" | "COMPLETED"` and returns early when
 * true, so calling capturePaymentWorkflow on an already-captured PayPal order
 * is safe and idempotent.
 *
 * System provider (pay-on-collection)
 * ────────────────────────────────────
 * The built-in `pp_system_default` provider's `capturePayment` is a no-op that
 * always returns CAPTURED, so running this subscriber for cash/collection orders
 * is also safe — it merely marks the payment as captured in Medusa's DB.
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { capturePaymentWorkflow } from "@medusajs/core-flows"

export default async function autoCapturePayment({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id
  if (!orderId) return

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // ── Fetch the order's payment collections and their payments ───────────────
  // Medusa links orders → payment_collections → payments via remoteQuery.
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "payment_collections.id",
      "payment_collections.payments.id",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.amount",
    ],
    filters: { id: orderId },
  })

  const order = orders?.[0] as
    | {
        id: string
        payment_collections?: Array<{
          id: string
          payments?: Array<{
            id: string
            provider_id?: string
            captured_at?: string | null
            amount?: number
          }>
        }>
      }
    | undefined

  if (!order) {
    logger.warn(
      `[auto-capture-payment] Order ${orderId} not found — skipping.`
    )
    return
  }

  const payments = order.payment_collections?.flatMap(
    (pc) => pc.payments ?? []
  ) ?? []

  if (!payments.length) {
    logger.info(
      `[auto-capture-payment] Order ${orderId} has no payments — skipping ` +
        `(cart may use system-default / pay-on-collection without a payment session).`
    )
    return
  }

  // ── Capture each non-yet-captured payment ─────────────────────────────────
  for (const payment of payments) {
    if (payment.captured_at) {
      logger.info(
        `[auto-capture-payment] Payment ${payment.id} on order ${orderId} ` +
          `already captured at ${payment.captured_at} — skipping.`
      )
      continue
    }

    try {
      await capturePaymentWorkflow(container).run({
        input: { payment_id: payment.id },
      })

      logger.info(
        `[auto-capture-payment] ✓ Captured payment ${payment.id} ` +
          `(provider: ${payment.provider_id ?? "unknown"}) ` +
          `for order ${orderId}.`
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      // Log but do not re-throw: a capture failure should not block the
      // order.placed event chain (other subscribers still need to run).
      logger.error(
        `[auto-capture-payment] ✗ Failed to capture payment ${payment.id} ` +
          `for order ${orderId}: ${message}`
      )
    }
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
