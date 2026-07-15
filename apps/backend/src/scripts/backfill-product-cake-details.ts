/**
 * backfill-product-cake-details.ts
 *
 * Ensures every published product has ingredients / allergens / storage
 * metadata so the storefront product detail cards are populated.
 *
 * Only fills *missing* keys — never overwrites admin-edited values.
 *
 * Run:
 *   cd apps/backend && npx medusa exec ./src/scripts/backfill-product-cake-details.ts
 *
 * Optional env:
 *   BACKFILL_DRY_RUN=1  — log changes without writing
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const DEFAULT_INGREDIENTS =
  "Flour, Sugar, Butter, Milk, Raising agents, Natural flavourings"

const DEFAULT_ALLERGENS = "Gluten, Dairy"

const DEFAULT_STORAGE =
  "Keep refrigerated and consume within 2 days. For best flavour, remove from the fridge 30–45 minutes before serving."

function hasText(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.map(String).some((s) => s.trim())
  return false
}

export default async function backfillProductCakeDetails({
  container,
}: ExecArgs) {
  const logger = container.resolve("logger")
  const productModule = container.resolve(Modules.PRODUCT)
  const dryRun = process.env.BACKFILL_DRY_RUN === "1"

  logger.info(
    `[backfill-cake-details] Starting${dryRun ? " (dry run)" : ""}…`
  )

  // Paginate through all products
  const pageSize = 100
  let offset = 0
  let updated = 0
  let skipped = 0
  let scanned = 0

  for (;;) {
    const [products, count] = await productModule.listAndCountProducts(
      {},
      {
        select: ["id", "title", "handle", "material", "metadata"],
        take: pageSize,
        skip: offset,
      }
    )

    if (!products.length) break

    for (const product of products) {
      scanned++
      const metadata =
        product.metadata && typeof product.metadata === "object"
          ? { ...(product.metadata as Record<string, unknown>) }
          : {}

      const hasIngredients =
        hasText(product.material) ||
        hasText(metadata.ingredients) ||
        hasText(metadata.material)
      const hasAllergens = hasText(metadata.allergens)
      const hasStorage =
        hasText(metadata.storage_serving) ||
        hasText(metadata.storage_and_serving)

      if (hasIngredients && hasAllergens && hasStorage) {
        skipped++
        continue
      }

      const nextMeta = { ...metadata }
      let nextMaterial: string | null | undefined = undefined

      if (!hasIngredients) {
        nextMeta.ingredients = DEFAULT_INGREDIENTS
        nextMeta.material = DEFAULT_INGREDIENTS
        nextMaterial = DEFAULT_INGREDIENTS
      } else if (!hasText(metadata.ingredients) && hasText(metadata.material)) {
        // Normalise legacy key → canonical ingredients
        nextMeta.ingredients = String(metadata.material).trim()
      } else if (
        !hasText(metadata.ingredients) &&
        hasText(product.material)
      ) {
        nextMeta.ingredients = String(product.material).trim()
      }

      if (!hasAllergens) {
        nextMeta.allergens = DEFAULT_ALLERGENS
      }

      if (!hasStorage) {
        nextMeta.storage_serving = DEFAULT_STORAGE
      }

      logger.info(
        `[backfill-cake-details] ${dryRun ? "Would update" : "Updating"} ${product.handle ?? product.id}`
      )

      if (!dryRun) {
        await productModule.updateProducts(product.id, {
          ...(nextMaterial !== undefined ? { material: nextMaterial } : {}),
          metadata: nextMeta,
        })
      }
      updated++
    }

    offset += products.length
    if (offset >= count) break
  }

  logger.info(
    `[backfill-cake-details] Done. scanned=${scanned} updated=${updated} skipped=${skipped}${dryRun ? " (dry run)" : ""}`
  )
}
