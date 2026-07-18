/**
 * production-catalogue-bootstrap.ts
 *
 * One-shot production catalogue setup. Runs the full pipeline in order:
 *
 *   0. purge-all-products
 *   1. seed-franchise-data
 *   2. setup-uk-market
 *   3. enable-paypal-on-region (optional)
 *   4. seed-cake-categories
 *   5. import-all-missing-products
 *   6. backfill-product-cake-details
 *   7. one-off/backfill-inventory-items
 *
 * Migrations are already applied by docker-entrypoint before this runs.
 *
 * Usage (Dokploy):
 *   RUN_SEED=true
 *   SEED_SCRIPTS=production-catalogue-bootstrap.ts
 *   Then recreate the backend container. Set RUN_SEED=false afterwards.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// .js extensions required under node16/nodenext moduleResolution (medusa build).
import purgeAllProducts from "./purge-all-products.js"
import seedFranchiseData from "./seed-franchise-data.js"
import setupUkMarket from "./setup-uk-market.js"
import enablePaypalOnRegion from "./enable-paypal-on-region.js"
import seedCakeCategories from "./seed-cake-categories.js"
import importAllMissingProducts from "./import-all-missing-products.js"
import backfillProductCakeDetails from "./backfill-product-cake-details.js"
import backfillInventoryItems from "./one-off/backfill-inventory-items.js"

type StepFn = (args: ExecArgs) => Promise<void>

async function runStep(
  logger: {
    info: (m: string) => void
    error: (m: string) => void
    warn: (m: string) => void
  },
  name: string,
  fn: StepFn,
  args: ExecArgs,
  opts: { optional?: boolean } = {}
) {
  logger.info("")
  logger.info(`▶ STEP: ${name}`)
  logger.info("─".repeat(60))
  try {
    await fn(args)
    logger.info(`✅ OK: ${name}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (opts.optional) {
      logger.warn(`⚠️  OPTIONAL step failed (continuing): ${name} — ${msg}`)
      return
    }
    logger.error(`❌ FAILED: ${name} — ${msg}`)
    throw err
  }
}

export default async function productionCatalogueBootstrap(args: ExecArgs) {
  const logger = args.container.resolve(ContainerRegistrationKeys.LOGGER)

  logger.info("╔══════════════════════════════════════════════════════════════╗")
  logger.info("║  Production catalogue bootstrap                             ║")
  logger.info("║  purge → franchise → UK → PayPal → categories → import…     ║")
  logger.info("╚══════════════════════════════════════════════════════════════╝")

  await runStep(logger, "0. purge-all-products", purgeAllProducts, args)
  await runStep(logger, "1. seed-franchise-data", seedFranchiseData, args)
  await runStep(logger, "2. setup-uk-market", setupUkMarket, args)
  await runStep(logger, "3. enable-paypal-on-region", enablePaypalOnRegion, args, {
    optional: true,
  })
  await runStep(logger, "4. seed-cake-categories", seedCakeCategories, args)
  await runStep(
    logger,
    "5. import-all-missing-products (live crawl — may take a long time)",
    importAllMissingProducts,
    args
  )
  await runStep(
    logger,
    "6. backfill-product-cake-details",
    backfillProductCakeDetails,
    args
  )
  await runStep(
    logger,
    "7. backfill-inventory-items",
    backfillInventoryItems,
    args
  )

  logger.info("")
  logger.info("╔══════════════════════════════════════════════════════════════╗")
  logger.info("║  Bootstrap COMPLETE                                         ║")
  logger.info("║  Set RUN_SEED=false in Dokploy and redeploy when ready.     ║")
  logger.info("╚══════════════════════════════════════════════════════════════╝")
}
