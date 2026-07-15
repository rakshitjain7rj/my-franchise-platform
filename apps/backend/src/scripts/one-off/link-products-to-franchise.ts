/**
 * link-products-to-franchise.ts
 *
 * One-time migration script: links every existing product that is NOT yet
 * linked to any franchise → to the first franchise in the database.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/link-products-to-franchise.ts
 *
 * To target a specific franchise, set the FRANCHISE_ID env var:
 *   FRANCHISE_ID=<your-id> npx medusa exec ./src/scripts/link-products-to-franchise.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import FranchiseProductLink from "../../links/franchise-product"

export default async function linkProductsToFranchise({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const franchiseService = container.resolve("franchise")
  const productService = container.resolve(Modules.PRODUCT)

  // ── 1. Resolve target franchise ────────────────────────────────────────────
  const targetFranchiseId = process.env.FRANCHISE_ID

  let franchiseId: string

  if (targetFranchiseId) {
    franchiseId = targetFranchiseId
    logger.info(`Using franchise from FRANCHISE_ID env: ${franchiseId}`)
  } else {
    const franchises = await franchiseService.listFranchises()
    if (!franchises.length) {
      logger.error("No franchises found. Run the franchise seed first.")
      return
    }
    franchiseId = franchises[0].id
    logger.info(`Auto-selected first franchise: ${franchises[0].name} (${franchiseId})`)
    if (franchises.length > 1) {
      logger.warn(
        `Multiple franchises exist. Set FRANCHISE_ID env var to target a specific one. ` +
        `Available IDs: ${franchises.map((f: { id: string; name: string }) => `${f.name}=${f.id}`).join(", ")}`
      )
    }
  }

  // ── 2. Fetch all products ──────────────────────────────────────────────────
  const allProducts = await productService.listProducts({})
  logger.info(`Found ${allProducts.length} total products in the catalog.`)

  if (!allProducts.length) {
    logger.warn("No products found. Add some products first via the Admin UI.")
    return
  }

  // ── 3. Fetch already-linked product IDs for this franchise ────────────────
  const { data: existingLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: { franchise_id: franchiseId },
  })

  const alreadyLinkedIds = new Set(
    existingLinks.map((link: { product_id?: string }) => link.product_id).filter(Boolean)
  )

  logger.info(`${alreadyLinkedIds.size} products already linked to this franchise.`)

  // ── 4. Identify unlinked products ──────────────────────────────────────────
  const unlinkedProducts = allProducts.filter((p) => !alreadyLinkedIds.has(p.id))

  if (!unlinkedProducts.length) {
    logger.info("✅ All products are already linked to this franchise. Nothing to do.")
    return
  }

  logger.info(`Linking ${unlinkedProducts.length} unlinked products...`)

  // ── 5. Create links in batch ───────────────────────────────────────────────
  let linked = 0
  let failed = 0

  for (const product of unlinkedProducts) {
    try {
      await remoteLink.create({
        franchise: { franchise_id: franchiseId },
        [Modules.PRODUCT]: { product_id: product.id },
      })
      logger.info(`  ✓ Linked: ${product.title || product.id} (${product.id})`)
      linked++
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`  ✗ Failed to link ${product.id}: ${message}`)
      failed++
    }
  }

  logger.info(`\n──────────────────────────────`)
  logger.info(`Done! Linked: ${linked}  |  Failed: ${failed}`)
  logger.info(`──────────────────────────────`)
  logger.info(`Refresh your Franchise Dashboard — all ${linked} products should now appear.`)
}
