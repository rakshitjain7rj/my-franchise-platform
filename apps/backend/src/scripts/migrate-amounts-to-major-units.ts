/**
 * migrate-amounts-to-major-units.ts
 *
 * One-time migration off the platform's legacy minor-units price convention
 * (3300 = £33.00, with every storefront formatter dividing by 100) to
 * Medusa v2's NATIVE major units (33 = £33.00). After this runs — together
 * with the code changes that remove every ÷100 — admin, storefront and PayPal
 * all agree: admin `33.00` = storefront `£33.00` = PayPal `£33.00`.
 *
 * What it does, in ONE transaction:
 *   1. Divides every money value by 100 across all Medusa money tables —
 *      both the numeric column and its `raw_*` jsonb twin (Medusa reads the
 *      raw BigNumber value preferentially, so the two must stay in sync).
 *   2. Rewrites `order_summary.totals` (flat jsonb of `*_total` numbers and
 *      `raw_*` twins) the same way.
 *   3. Divides `promotion_application_method.value` ONLY for fixed-amount
 *      promotions (percentage promos like CAKEBREAK are rates, not money).
 *   4. Stamps `store.metadata.amount_unit_convention = "major"` as the
 *      idempotency marker — a second run aborts before touching anything.
 *
 * Quantities, tax rates and inventory levels are intentionally untouched.
 *
 * SAFETY: take a backup first (pg_dump), and restart the backend afterwards
 * so no in-flight request mixes conventions.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/migrate-amounts-to-major-units.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const MARKER_KEY = "amount_unit_convention"
const MARKER_VALUE = "major"

/** table → money columns (each has a raw_<col> jsonb twin unless noted). */
const MONEY_COLUMNS: Record<string, string[]> = {
  capture: ["amount"],
  cart_line_item: ["unit_price", "compare_at_unit_price"],
  cart_line_item_adjustment: ["amount"],
  cart_shipping_method: ["amount"],
  cart_shipping_method_adjustment: ["amount"],
  credit_line: ["amount"],
  order_change_action: ["amount"],
  order_claim: ["refund_amount"],
  order_credit_line: ["amount"],
  order_exchange: ["difference_due"],
  order_item: ["unit_price", "compare_at_unit_price"],
  order_line_item: ["unit_price", "compare_at_unit_price"],
  order_line_item_adjustment: ["amount"],
  order_shipping_method: ["amount"],
  order_shipping_method_adjustment: ["amount"],
  order_transaction: ["amount"],
  payment: ["amount"],
  payment_collection: [
    "amount",
    "authorized_amount",
    "captured_amount",
    "refunded_amount",
  ],
  payment_session: ["amount"],
  price: ["amount"],
  refund: ["amount"],
  return: ["refund_amount"],
}

export default async function migrateAmountsToMajorUnits({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  // ── Idempotency guard ───────────────────────────────────────────────────
  const stores = await knex("store").select("id", "metadata")
  if (!stores.length) throw new Error("No store row found — is the DB seeded?")
  if (stores.some((s: any) => s.metadata?.[MARKER_KEY] === MARKER_VALUE)) {
    logger.info(
      "✓ Amounts are already in major units (store.metadata marker present) — nothing to do."
    )
    return
  }

  await knex.transaction(async (trx: any) => {
    // ── 1. Numeric money columns + raw_* jsonb twins ─────────────────────
    for (const [table, columns] of Object.entries(MONEY_COLUMNS)) {
      const numericSets = columns.map((c) => `${c} = ${c} / 100.0`)
      // jsonb_exists() instead of the `?` operator — knex.raw would treat a
      // literal `?` as a binding placeholder.
      const rawSets = columns.map(
        (c) =>
          `raw_${c} = CASE WHEN raw_${c} IS NOT NULL AND jsonb_exists(raw_${c}, 'value')
             THEN jsonb_set(raw_${c}, '{value}',
                  to_jsonb((((raw_${c}->>'value')::numeric) / 100)::text))
             ELSE raw_${c} END`
      )
      const result = await trx.raw(
        `UPDATE "${table}" SET ${[...numericSets, ...rawSets].join(", ")}`
      )
      logger.info(
        `  ${table}: ${result.rowCount} row(s) → [${columns.join(", ")}] ÷ 100`
      )
    }

    // ── 2. order_summary.totals (flat jsonb: numbers + raw_* twins) ──────
    const summary = await trx.raw(`
      UPDATE order_summary SET totals = (
        SELECT jsonb_object_agg(
          key,
          CASE
            WHEN key LIKE 'raw\\_%' AND jsonb_typeof(value -> 'value') = 'string'
              THEN jsonb_set(value, '{value}',
                   to_jsonb((((value ->> 'value')::numeric) / 100)::text))
            WHEN jsonb_typeof(value) = 'number'
              THEN to_jsonb(((value)::text)::numeric / 100)
            ELSE value
          END
        )
        FROM jsonb_each(totals)
      )
      WHERE totals IS NOT NULL AND totals <> '{}'::jsonb
    `)
    logger.info(`  order_summary: ${summary.rowCount} row(s) → totals ÷ 100`)

    // ── 3. Fixed-amount promotions only (percentages are rates) ──────────
    const promos = await trx.raw(`
      UPDATE promotion_application_method SET
        value = value / 100.0,
        raw_value = CASE WHEN raw_value IS NOT NULL AND jsonb_exists(raw_value, 'value')
          THEN jsonb_set(raw_value, '{value}',
               to_jsonb((((raw_value->>'value')::numeric) / 100)::text))
          ELSE raw_value END
      WHERE type = 'fixed'
    `)
    logger.info(
      `  promotion_application_method (fixed only): ${promos.rowCount} row(s) ÷ 100`
    )

    // ── 4. Idempotency marker ─────────────────────────────────────────────
    await trx.raw(
      `UPDATE store SET metadata =
         COALESCE(metadata, '{}'::jsonb) || ?::jsonb`,
      [JSON.stringify({ [MARKER_KEY]: MARKER_VALUE })]
    )
  })

  logger.info(
    "✅ All amounts migrated to Medusa-native major units. Restart the backend " +
      "(and storefront dev server) so no cached request mixes conventions."
  )
}
