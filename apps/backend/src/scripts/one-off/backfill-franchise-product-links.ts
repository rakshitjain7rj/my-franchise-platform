/**
 * backfill-franchise-product-links.ts
 *
 * One-time reconcile for legacy products that were tagged with a franchise via
 * the old `metadata.franchise_ids` array (e.g. by the now-removed
 * `force-franchise-products.ts`) but never got a real `franchise-product` link
 * row. It creates the missing link row for each and then strips the stale
 * `franchise_ids` metadata key, so the read paths depend only on the link table.
 *
 * The franchise-product link is one-to-many (a product belongs to exactly one
 * franchise), so no schema migration is required — this only touches data. A
 * product referencing more than one franchise in metadata is a data error and
 * is skipped with a warning rather than silently linked to several franchises.
 *
 * Idempotent and safe to run repeatedly.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/backfill-franchise-product-links.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import FranchiseProductLink from "../../links/franchise-product"

const BATCH_SIZE = 200

export default async function backfillFranchiseProductLinks({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const productService = container.resolve(Modules.PRODUCT)

  logger.info("Backfilling franchise-product links from metadata.franchise_ids…")

  // 1. Build a set of existing (franchise_id, product_id) pairs so the backfill
  //    is idempotent and never attempts to create a duplicate link.
  const { data: existingLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["franchise_id", "product_id"],
  })

  const existingPairs = new Set<string>(
    existingLinks
      .filter((l: any) => l.franchise_id && l.product_id)
      .map((l: any) => `${l.franchise_id}::${l.product_id}`)
  )

  // 2. Collect valid franchise IDs so we never link to a deleted franchise.
  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id"],
  })
  const validFranchiseIds = new Set<string>(
    franchises.map((f: any) => f.id).filter(Boolean)
  )

  let linksCreated = 0
  let metadataCleared = 0
  let skippedInvalid = 0
  let failed = 0
  let totalScanned = 0

  // 3. Page through products carrying the legacy metadata array.
  for (let offset = 0; ; offset += BATCH_SIZE) {
    const products = await productService.listProducts(
      {},
      { take: BATCH_SIZE, skip: offset }
    )
    if (!products.length) break
    totalScanned += products.length

    for (const product of products) {
      const metadata = (product.metadata ?? {}) as Record<string, unknown>
      const rawIds = metadata.franchise_ids
      const franchiseIds = Array.isArray(rawIds)
        ? (rawIds.filter((id) => typeof id === "string") as string[])
        : []

      if (!franchiseIds.length) continue

      // A product belongs to exactly one franchise. More than one in metadata is
      // a data error — skip it rather than fabricate multiple ownerships.
      if (franchiseIds.length > 1) {
        logger.warn(
          `⚠ Product ${product.id} lists ${franchiseIds.length} franchises in metadata; a product may belong to only one. Skipping — resolve manually.`
        )
        skippedInvalid++
        continue
      }

      // True only when the referenced franchise ends up linked — we must not
      // strip the metadata on failure or we would lose the association.
      let fullyLinked = true

      for (const franchiseId of franchiseIds) {
        if (!validFranchiseIds.has(franchiseId)) {
          logger.warn(
            `⚠ Product ${product.id} references unknown franchise ${franchiseId}; skipping that link.`
          )
          skippedInvalid++
          fullyLinked = false
          continue
        }

        const pairKey = `${franchiseId}::${product.id}`
        if (existingPairs.has(pairKey)) continue

        try {
          await remoteLink.create({
            franchise: { franchise_id: franchiseId },
            [Modules.PRODUCT]: { product_id: product.id },
          })
          existingPairs.add(pairKey)
          linksCreated++
          logger.info(`✓ Linked product ${product.id} → franchise ${franchiseId}`)
        } catch (err: any) {
          logger.error(
            `✗ Failed to link product ${product.id} → franchise ${franchiseId}: ${
              err.message || err
            }`
          )
          failed++
          fullyLinked = false
        }
      }

      // 4. Retire the fallback for this product only once it is fully migrated.
      if (fullyLinked) {
        const nextMetadata = { ...metadata }
        delete nextMetadata.franchise_ids
        try {
          await productService.updateProducts(product.id, {
            metadata: nextMetadata,
          })
          metadataCleared++
        } catch (err: any) {
          logger.error(
            `✗ Failed to clear franchise_ids metadata for product ${product.id}: ${
              err.message || err
            }`
          )
          failed++
        }
      }
    }

    if (products.length < BATCH_SIZE) break
  }

  logger.info(`\n──────────────────────────────────────────────────`)
  logger.info(`Backfill complete. Scanned ${totalScanned} products.`)
  logger.info(`  Links created:           ${linksCreated}`)
  logger.info(`  Metadata cleared:        ${metadataCleared}`)
  logger.info(`  Skipped (unknown franchise): ${skippedInvalid}`)
  logger.info(`  Failed:                  ${failed}`)
  logger.info(`──────────────────────────────────────────────────`)
}
