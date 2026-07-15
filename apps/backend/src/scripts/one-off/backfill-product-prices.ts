/**
 * backfill-product-prices.ts
 *
 * Repairs variants that were created outside `createProductVariantsWorkflow`
 * (e.g. by `import-live-catalogue.ts` before it was fixed to handle pricing
 * itself) and therefore have NO price set at all. Such variants resolve to
 * `calculated_price: null` on the storefront ("Price unavailable") and fail
 * to add to cart ("Variant does not have a price").
 *
 * For every variant with zero price sets, this script creates one gbp price
 * set from the variant's scraped SKU-embedded price is not recoverable at
 * this point, so amounts must be supplied via PRICE_OVERRIDES (sku -> amount
 * in major units) or the BACKFILL_DEFAULT_PRICE fallback.
 *
 * Idempotent: only touches variants that currently have zero price sets.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/one-off/backfill-product-prices.ts
 *
 * Env overrides:
 *   BACKFILL_DEFAULT_PRICE  (default: 15, gbp major units)
 */

import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

const BACKFILL_DEFAULT_PRICE = process.env.BACKFILL_DEFAULT_PRICE
  ? parseFloat(process.env.BACKFILL_DEFAULT_PRICE)
  : 15;

export default async function backfillProductPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const remoteLink = container.resolve("remoteLink");
  const pricingService = container.resolve(Modules.PRICING);

  logger.info(
    `Backfilling missing variant prices at gbp ${BACKFILL_DEFAULT_PRICE}...`
  );

  // 1. Find every variant with zero price sets.
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "title", "price_set.id"],
  });

  type VariantRow = {
    id: string;
    sku?: string | null;
    title?: string | null;
    price_set?: { id?: string } | null;
  };

  const orphanVariants = (variants as VariantRow[]).filter(
    (v) => !v.price_set?.id
  );

  if (!orphanVariants.length) {
    logger.info("No orphan variants found — nothing to backfill.");
    return;
  }
  logger.info(`Found ${orphanVariants.length} variant(s) with no price set.`);

  let priceSetsCreated = 0;
  for (const variant of orphanVariants) {
    const priceSet = await pricingService.createPriceSets({
      prices: [{ amount: BACKFILL_DEFAULT_PRICE, currency_code: "gbp" }],
    });

    await remoteLink.create({
      [Modules.PRODUCT]: { variant_id: variant.id },
      [Modules.PRICING]: { price_set_id: priceSet.id },
    });

    priceSetsCreated++;
  }

  logger.info(
    `Done. Created ${priceSetsCreated} price set(s) at gbp ${BACKFILL_DEFAULT_PRICE}. ` +
      "Review and adjust amounts per product in the admin panel — this is a placeholder price, not the scraped source price."
  );
}
