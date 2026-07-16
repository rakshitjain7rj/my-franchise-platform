/**
 * Non-destructive backfill: attaches Phase-1 product customization metadata
 * to existing catalogue products (servings_map, supported_flavours,
 * supports_inscription) and variant.metadata.servings when missing.
 *
 * Does NOT delete products. Safe to re-run (skips keys that already exist).
 *
 * Usage:
 *   cd apps/backend && npx medusa exec ./src/scripts/one-off/backfill-product-cake-metadata.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

const DEFAULT_FLAVOURS = [
  "Eggless Vanilla",
  "Eggless Chocolate",
  "Eggless Red Velvet",
]

const DEFAULT_SERVINGS_MAP: Record<string, string> = {
  "1kg": "8-10 servings",
  "2kg": "16-20 servings",
  "6-inch": "8-10 servings",
  "8-inch": "12-15 servings",
  "10-inch": "18-22 servings",
  "12-inch": "25-30 servings",
}

function inferServingsFromTitle(title: string): string | null {
  const t = title.toLowerCase()
  if (t.includes("2kg") || t.includes("2 kg")) return "16-20 servings"
  if (t.includes("1kg") || t.includes("1 kg")) return "8-10 servings"
  if (t.includes("12")) return "25-30 servings"
  if (t.includes("10")) return "18-22 servings"
  if (t.includes("8")) return "12-15 servings"
  if (t.includes("6")) return "8-10 servings"
  return null
}

export default async function backfillProductCakeMetadata({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        id: string
        title: string
        metadata?: Record<string, unknown> | null
        variants?: Array<{
          id: string
          title: string
          metadata?: Record<string, unknown> | null
        }>
      }>
    >
    updateProducts: (
      id: string,
      data: Record<string, unknown>
    ) => Promise<unknown>
    updateProductVariants?: (
      id: string,
      data: Record<string, unknown>
    ) => Promise<unknown>
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Backfill product cake customization metadata")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  const products = await productService.listProducts(
    {},
    {
      take: 500,
      relations: ["variants"],
    }
  )

  let productUpdated = 0
  let variantUpdated = 0

  for (const product of products) {
    const meta = { ...(product.metadata ?? {}) }
    let dirty = false

    if (meta.supports_inscription === undefined) {
      meta.supports_inscription = "true"
      dirty = true
    }
    if (meta.supports_photo_upload === undefined) {
      meta.supports_photo_upload = /photo/i.test(product.title)
        ? "true"
        : "false"
      dirty = true
    }
    if (meta.supported_flavours === undefined) {
      meta.supported_flavours = JSON.stringify(DEFAULT_FLAVOURS)
      dirty = true
    }
    if (meta.servings_map === undefined) {
      meta.servings_map = JSON.stringify(DEFAULT_SERVINGS_MAP)
      dirty = true
    }
    if (meta.storage_serving === undefined && !meta.storage_and_serving) {
      meta.storage_serving =
        "Keep refrigerated. Best served at room temperature."
      dirty = true
    }

    // Ingredients / allergens: do NOT invent placeholders. Magento does not
    // publish them per product. Use scrape-live-ingredients-allergens.ts for
    // accurate dietary claims, and the admin "Cake details" widget for
    // real ingredient/allergen copy when the bakery provides it.
    // Keep legacy metadata.material → ingredients normalisation only.
    if (
      !(typeof meta.ingredients === "string" && meta.ingredients.trim()) &&
      typeof meta.material === "string" &&
      meta.material.trim()
    ) {
      meta.ingredients = meta.material.trim()
      dirty = true
    }

    if (dirty) {
      await productService.updateProducts(product.id, { metadata: meta })
      productUpdated++
      logger.info(`  ✓ product metadata: ${product.title}`)
    }

    // Variant servings
    for (const variant of product.variants ?? []) {
      const vMeta = { ...(variant.metadata ?? {}) }
      if (vMeta.servings !== undefined) continue

      const inferred =
        inferServingsFromTitle(variant.title) ||
        DEFAULT_SERVINGS_MAP[variant.title] ||
        "8-10 servings"

      vMeta.servings = inferred

      if (typeof productService.updateProductVariants === "function") {
        await productService.updateProductVariants(variant.id, {
          metadata: vMeta,
        })
        variantUpdated++
      }
    }
  }

  logger.info(
    `\nDone. Products updated: ${productUpdated}, variants updated: ${variantUpdated} (of ${products.length} products).`
  )
}
