/**
 * force-link-products-to-franchise.ts
 *
 * Migration/utility script to force link all products in the catalog to a target franchise.
 * 1. Resolves target franchise ID (default is Cakery Amritsar: 01KVA1YYMGRBTV46R63QDT0FW0).
 * 2. Links each product to the franchise via the remote link engine. The
 *    franchise-product link is many-to-many, so a product can belong to several
 *    franchises without conflict.
 * 3. Is fully idempotent and safe to run multiple times.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/force-link-products-to-franchise.ts
 *
 * Or targeting a specific franchise:
 *   FRANCHISE_ID=01KSMMJ346PVFAN9G0ZNCDZ8E7 npx medusa exec ./src/scripts/force-link-products-to-franchise.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import FranchiseProductLink from "../../links/franchise-product"

export default async function forceLinkProductsToFranchise({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const productService = container.resolve(Modules.PRODUCT)

  // 1. Resolve target franchise
  const franchiseId = process.env.FRANCHISE_ID || "01KVA1YYMGRBTV46R63QDT0FW0"
  
  // Verify franchise exists in database
  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id", "name"],
    filters: { id: franchiseId },
  })

  if (!franchises.length) {
    logger.error(`Franchise with ID "${franchiseId}" not found in database.`)
    return
  }

  const targetFranchise = franchises[0]
  logger.info(`Starting force-linking for franchise: ${targetFranchise.name} (${franchiseId})`)

  // 2. Query existing links for this franchise (product_id only — lightweight)
  const { data: existingLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: { franchise_id: franchiseId },
  })

  const alreadyLinkedProductIds = new Set(
    existingLinks.map((link: any) => link.product_id).filter(Boolean)
  )

  let linkedViaEngine = 0
  let alreadyLinked = 0
  let failed = 0
  let totalProcessed = 0

  // 3. Process products in batches so we never load the entire catalogue into
  //    memory at once — safe against production-size catalogues.
  const BATCH_SIZE = 200

  for (let offset = 0; ; offset += BATCH_SIZE) {
    const products = await productService.listProducts(
      {},
      { take: BATCH_SIZE, skip: offset }
    )

    if (!products.length) break
    totalProcessed += products.length

    for (const product of products) {
      const productId = product.id
      const productTitle = product.title || productId

      // A. Skip if already linked.
      if (alreadyLinkedProductIds.has(productId)) {
        logger.info(`- ${productTitle} (${productId}) is already linked.`)
        alreadyLinked++
        continue
      }

      // B. Link via the link engine (many-to-many → no single-franchise limit).
      try {
        await remoteLink.create({
          franchise: { franchise_id: franchiseId },
          [Modules.PRODUCT]: { product_id: productId },
        })
        logger.info(`✓ Linked: ${productTitle}`)
        linkedViaEngine++
      } catch (err: any) {
        logger.error(
          `✗ Failed to link ${productTitle}: ${err.message || String(err)}`
        )
        failed++
      }
    }

    // Final partial batch → no more pages to fetch.
    if (products.length < BATCH_SIZE) break
  }

  if (totalProcessed === 0) {
    logger.warn("No products found in the catalog. Add products first.")
    return
  }

  logger.info(`\n──────────────────────────────────────────────────`)
  logger.info(`Processed ${totalProcessed} total products in the catalog.`)
  logger.info(`Done! Force Link Summary for ${targetFranchise.name} (${franchiseId}):`)
  logger.info(`  Already Linked: ${alreadyLinked}`)
  logger.info(`  Linked: ${linkedViaEngine}`)
  logger.info(`  Failed: ${failed}`)
  logger.info(`──────────────────────────────────────────────────`)
}
