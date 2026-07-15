w/**
 * setup-uk-market.ts
 *
 * Aligns the platform to its real market — the United Kingdom / GBP:
 *
 *   1. Region        : renamed "United Kingdom", currency gbp, countries [gb].
 *   2. Store         : gbp added to supported currencies and made the default.
 *   3. Variant prices: every variant missing a gbp price gets one (copied from
 *                      its eur amount, falling back to usd). Amounts are
 *                      Medusa-native major units (33 = £33.00 — migrated
 *                      2026-07-09), so we copy verbatim.
 *   4. Shipping      : demo "Standard/Express Shipping" removed; replaced by
 *                      "Store Pickup" (free, flat) and "Local Delivery"
 *                      (calculated via cake_cake provider — same maths as
 *                      GET /store/stores/:id/delivery-fee).
 *   5. Promotion     : a real 10%-off order promotion with code CAKEBREAK so
 *                      the storefront discount box exercises Medusa's
 *                      promotions engine.
 *
 * Idempotent: every step checks current state first.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/setup-uk-market.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createPromotionsWorkflow,
  createShippingOptionsWorkflow,
  deleteShippingOptionsWorkflow,
  updateRegionsWorkflow,
  updateShippingOptionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

const PROMO_CODE = "CAKEBREAK"
/** Fallback flat amount only if calculated pricing cannot run (legacy). */
const LOCAL_DELIVERY_AMOUNT = 5 // £5.00 (Medusa-native major units)
/** Provider registered in medusa-config (id "cake" + service identifier "cake"). */
const CAKE_FULFILLMENT_PROVIDER_ID = "cake_cake"

export default async function setupUkMarket({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricingService = container.resolve(Modules.PRICING)
  const promotionService = container.resolve(Modules.PROMOTION)

  // ── 1. Region → United Kingdom / gbp ───────────────────────────────────────
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code"],
    filters: {},
  })
  if (!regions.length) throw new Error("No region found.")
  const region = regions[0] as { id: string; name: string; currency_code: string }

  if (region.currency_code !== "gbp" || region.name !== "United Kingdom") {
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: {
          name: "United Kingdom",
          currency_code: "gbp",
          countries: ["gb"],
        },
      },
    })
    logger.info(`✅ Region ${region.id} → United Kingdom (gbp)`)
  } else {
    logger.info("✓ Region already United Kingdom (gbp)")
  }

  // ── 2. Store default currency → gbp ────────────────────────────────────────
  const { data: stores } = await query.graph({
    entity: "store",
    fields: [
      "id",
      "default_sales_channel_id",
      "supported_currencies.currency_code",
      "supported_currencies.is_default",
    ],
    filters: {},
  })
  const store = (stores as any[]).find((s) => s.default_sales_channel_id)
  if (!store) throw new Error("No store with a default sales channel found.")

  const currencies: Array<{ currency_code: string; is_default?: boolean }> =
    store.supported_currencies ?? []
  const gbpIsDefault = currencies.some(
    (c) => c.currency_code === "gbp" && c.is_default
  )

  if (!gbpIsDefault) {
    const codes = new Set(currencies.map((c) => c.currency_code))
    codes.add("gbp")
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: Array.from(codes).map((code) => ({
            currency_code: code,
            is_default: code === "gbp",
          })),
        },
      },
    })
    logger.info(`✅ Store ${store.id}: gbp set as default currency`)
  } else {
    logger.info("✓ Store already defaults to gbp")
  }

  // ── 3. Ensure every variant has a gbp price ────────────────────────────────
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "title",
      "price_set.id",
      "price_set.prices.amount",
      "price_set.prices.currency_code",
    ],
    filters: {},
  })

  let pricesAdded = 0
  for (const variant of variants as any[]) {
    const priceSet = variant.price_set
    if (!priceSet?.id) continue

    const prices: Array<{ amount: number; currency_code: string }> =
      priceSet.prices ?? []
    if (prices.some((p) => p.currency_code === "gbp")) continue

    const source =
      prices.find((p) => p.currency_code === "eur") ??
      prices.find((p) => p.currency_code === "usd") ??
      prices[0]
    if (!source) continue

    await pricingService.addPrices({
      priceSetId: priceSet.id,
      prices: [{ amount: Number(source.amount), currency_code: "gbp" }],
    })
    pricesAdded++
  }
  logger.info(
    pricesAdded
      ? `✅ Added gbp prices to ${pricesAdded} variant(s)`
      : "✓ All variants already have gbp prices"
  )

  // ── 4. Shipping options: pickup (flat) + local delivery (calculated) ───────
  // Local Delivery uses cake_cake + price_type=calculated so cart.shipping_total
  // matches GET /store/stores/:id/delivery-fee (not a flat £5 UI mismatch).
  const link = container.resolve(ContainerRegistrationKeys.REMOTE_LINK)

  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id"],
  })
  for (const sl of stockLocations as Array<{ id: string }>) {
    try {
      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: sl.id },
        [Modules.FULFILLMENT]: {
          fulfillment_provider_id: CAKE_FULFILLMENT_PROVIDER_ID,
        },
      })
    } catch {
      // already linked
    }
  }
  logger.info(
    `✓ Ensured ${CAKE_FULFILLMENT_PROVIDER_ID} on ${(stockLocations as any[]).length} stock location(s)`
  )

  const { data: shippingOptions } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "service_zone_id",
      "shipping_profile_id",
      "provider_id",
      "price_type",
      "data",
    ],
    filters: {},
  })

  const template = (shippingOptions as any[])[0]
  if (!template) throw new Error("No existing shipping option to copy zone/profile from.")

  const names = new Set((shippingOptions as any[]).map((o) => o.name))
  const optionsToCreate: any[] = []

  if (!names.has("Store Pickup")) {
    optionsToCreate.push({
      name: "Store Pickup",
      price_type: "flat",
      provider_id: template.provider_id,
      service_zone_id: template.service_zone_id,
      shipping_profile_id: template.shipping_profile_id,
      type: {
        label: "Pickup",
        description: "Collect from your chosen Cake Break boutique.",
        code: "pickup",
      },
      prices: [
        { currency_code: "gbp", amount: 0 },
        { region_id: region.id, amount: 0 },
      ],
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    })
  }

  if (!names.has("Local Delivery")) {
    optionsToCreate.push({
      name: "Local Delivery",
      price_type: "calculated",
      provider_id: CAKE_FULFILLMENT_PROVIDER_ID,
      service_zone_id: template.service_zone_id,
      shipping_profile_id: template.shipping_profile_id,
      data: { id: "cake-local-delivery" },
      type: {
        label: "Delivery",
        description: "Hand-delivered locally by the bakery (distance-based fee).",
        code: "local-delivery",
      },
      prices: [
        { currency_code: "gbp", amount: LOCAL_DELIVERY_AMOUNT },
        { region_id: region.id, amount: LOCAL_DELIVERY_AMOUNT },
      ],
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    })
  }

  if (optionsToCreate.length) {
    await createShippingOptionsWorkflow(container).run({
      input: optionsToCreate,
    })
    logger.info(
      `✅ Created shipping option(s): ${optionsToCreate.map((o) => o.name).join(", ")}`
    )
  } else {
    logger.info("✓ Pickup/delivery shipping options already exist")
  }

  // Migrate existing flat Local Delivery → calculated cake provider.
  const localDelivery = (shippingOptions as any[]).find(
    (o) => o.name === "Local Delivery"
  )
  if (
    localDelivery &&
    (localDelivery.price_type !== "calculated" ||
      localDelivery.provider_id !== CAKE_FULFILLMENT_PROVIDER_ID)
  ) {
    await updateShippingOptionsWorkflow(container).run({
      input: [
        {
          id: localDelivery.id,
          price_type: "calculated",
          provider_id: CAKE_FULFILLMENT_PROVIDER_ID,
          data: { id: "cake-local-delivery" },
        },
      ],
    })
    logger.info(
      `✅ Migrated Local Delivery ${localDelivery.id} → calculated ${CAKE_FULFILLMENT_PROVIDER_ID}`
    )
  }

  const demoOptionIds = (shippingOptions as any[])
    .filter((o) => o.name === "Standard Shipping" || o.name === "Express Shipping")
    .map((o) => o.id)
  if (demoOptionIds.length) {
    await deleteShippingOptionsWorkflow(container).run({
      input: { ids: demoOptionIds },
    })
    logger.info(`✅ Removed ${demoOptionIds.length} demo shipping option(s)`)
  }

  // ── 4b. Ensure every product has the Default Shipping Profile ──────────────
  //  Products created via seed scripts or the admin UI without an explicit
  //  shipping_profile_id end up with NULL in product_shipping_profile, which
  //  causes Medusa to reject cart completion with:
  //  "cart items require shipping profiles that are not satisfied by current
  //   shipping methods".  We heal this idempotently here.
  const pgConnection = container.resolve("__pg_connection__")
  const defaultProfileId = template.shipping_profile_id

  const { rowCount } = await pgConnection.raw(`
    INSERT INTO product_shipping_profile (id, product_id, shipping_profile_id)
    SELECT
      gen_random_uuid()::text,
      p.id,
      ?
    FROM product p
    WHERE p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM product_shipping_profile psp
        WHERE psp.product_id = p.id AND psp.deleted_at IS NULL
      )
    ON CONFLICT DO NOTHING
  `, [defaultProfileId])

  if (rowCount && rowCount > 0) {
    logger.info(`✅ Assigned Default Shipping Profile to ${rowCount} product(s) that were missing it`)
  } else {
    logger.info("✓ All products already have a shipping profile")
  }

  // ── 5. CAKEBREAK promotion (10% off the order) ─────────────────────────────
  const existingPromos = await promotionService.listPromotions({
    code: [PROMO_CODE],
  })
  if (!existingPromos.length) {
    await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: [
          {
            code: PROMO_CODE,
            type: "standard",
            status: "active",
            is_automatic: false,
            application_method: {
              type: "percentage",
              target_type: "order",
              allocation: "across",
              value: 10,
              currency_code: "gbp",
            },
          },
        ],
      },
    })
    logger.info(`✅ Created promotion ${PROMO_CODE} (10% off order)`)
  } else {
    logger.info(`✓ Promotion ${PROMO_CODE} already exists`)
  }

  logger.info("UK market setup complete.")
}
