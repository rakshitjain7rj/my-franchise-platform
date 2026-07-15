/**
 * relink-products-to-live-franchise.ts
 *
 * The franchise-product link is one-to-many (one product belongs to exactly
 * ONE franchise).  All 13 products currently have stale links pointing at
 * deleted test franchise IDs.  This script:
 *   1. Lists all products.
 *   2. For each product, dismisses its current franchise link (regardless of
 *      which franchise it points to).
 *   3. Creates a fresh link to TARGET_FRANCHISE_ID.
 *
 * It is idempotent: if a product is already linked to TARGET_FRANCHISE_ID
 * it is left untouched (no dismiss + re-create needed).
 *
 * Usage:
 *   npx medusa exec ./src/scripts/relink-products-to-live-franchise.ts
 *
 * Or target a different franchise:
 *   FRANCHISE_ID=fran_01... npx medusa exec ./src/scripts/relink-products-to-live-franchise.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import FranchiseProductLink from "../../links/franchise-product"

export default async function relinkProductsToLiveFranchise({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const productService = container.resolve(Modules.PRODUCT)

  const targetFranchiseId =
    process.env.FRANCHISE_ID ?? "fran_01KWKB6ET5SHWPTRP07DN0QPQS"

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Relink All Products → Live Franchise")
  logger.info(`  Target: ${targetFranchiseId}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // ── 1. Verify target franchise exists ─────────────────────────────────────
  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id", "name"],
    filters: { id: targetFranchiseId },
  })

  if (!franchises.length) {
    logger.error(`Target franchise "${targetFranchiseId}" not found in the database.`)
    throw new Error(`Franchise not found: ${targetFranchiseId}`)
  }

  const targetFranchise = franchises[0] as { id: string; name: string }
  logger.info(`✓ Target franchise: ${targetFranchise.name} (${targetFranchise.id})`)

  // ── 2. Fetch all products ──────────────────────────────────────────────────
  const BATCH_SIZE = 200
  let alreadyCorrect = 0
  let relinked = 0
  let failed = 0
  let totalProcessed = 0

  for (let offset = 0; ; offset += BATCH_SIZE) {
    const products = await productService.listProducts(
      {},
      { take: BATCH_SIZE, skip: offset }
    )

    if (!products.length) break
    totalProcessed += products.length

    for (const product of products) {
      const productId = product.id
      const title = product.title || productId

      // ── 3. Check current link for this product ─────────────────────────────
      const { data: currentLinks } = await query.graph({
        entity: FranchiseProductLink.entryPoint,
        fields: ["franchise_id", "product_id"],
        filters: { product_id: productId },
      })

      const currentLink = currentLinks[0] as
        | { franchise_id?: string; product_id?: string }
        | undefined

      // Already linked to the correct franchise — nothing to do.
      if (currentLink?.franchise_id === targetFranchiseId) {
        logger.info(`  ✓ Already correct: ${title}`)
        alreadyCorrect++
        continue
      }

      // ── 4. Dismiss the stale link (if any) ────────────────────────────────
      if (currentLink?.franchise_id) {
        try {
          await remoteLink.dismiss({
            franchise: { franchise_id: currentLink.franchise_id },
            [Modules.PRODUCT]: { product_id: productId },
          })
          logger.info(
            `  → Dismissed stale link: ${title} (was franchise_id=${currentLink.franchise_id})`
          )
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          logger.warn(`  ⚠ Could not dismiss old link for ${title}: ${msg} — will still try to create.`)
        }
      }

      // ── 5. Create the fresh link ───────────────────────────────────────────
      try {
        await remoteLink.create({
          franchise: { franchise_id: targetFranchiseId },
          [Modules.PRODUCT]: { product_id: productId },
        })
        logger.info(`  ✅ Relinked: ${title}`)
        relinked++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error(`  ✗ Failed to relink ${title}: ${msg}`)
        failed++
      }
    }

    if (products.length < BATCH_SIZE) break
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  Summary for: ${targetFranchise.name}`)
  logger.info(`  Total products processed : ${totalProcessed}`)
  logger.info(`  Already correctly linked : ${alreadyCorrect}`)
  logger.info(`  Re-linked successfully   : ${relinked}`)
  logger.info(`  Failed                   : ${failed}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  if (failed > 0) {
    logger.warn(
      `${failed} product(s) could not be linked. ` +
        `Check the errors above and re-run the script.`
    )
  } else {
    logger.info("✅ All products are now linked to the live franchise!")
    logger.info("   Next steps:")
    logger.info("   1. Publish any draft products in the Medusa Admin UI.")
    logger.info("   2. Verify: curl /store/products -H 'x-franchise-id: " + targetFranchiseId + "'")
  }
}
