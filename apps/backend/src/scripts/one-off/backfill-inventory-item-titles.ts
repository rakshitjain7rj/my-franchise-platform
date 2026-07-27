/**
 * backfill-inventory-item-titles.ts
 *
 * Inventory admin lists show inventory-item **title**, which was copied from
 * the variant title only (e.g. `8" / Chocolate Sponge`). That makes hundreds
 * of rows look generic — you cannot tell which cake they belong to without
 * decoding the SKU.
 *
 * This script rewrites inventory item titles to:
 *
 *   `{Product title} — {Variant title}`
 *
 * Example:
 *   `(X2) Christmas Themed Cake — 8" (approx 10 servings) / Chocolate Sponge`
 *
 * Idempotent: skips rows that already use the product-prefixed form.
 * Does **not** change SKUs, stock quantities, or (by default) variant titles
 * — storefront variant pickers keep the short size/flavour labels.
 *
 * Usage:
 *   cd apps/backend
 *   npx medusa exec ./src/scripts/one-off/backfill-inventory-item-titles.ts
 *
 * Env:
 *   DRY_RUN=1                 Log changes only (default: apply)
 *   UPDATE_VARIANT_TITLES=1   Also rename product_variant.title the same way
 *   BATCH_SIZE=100            Inventory update batch size (default 100)
 *   LIMIT=0                   Max inventory items to update (0 = all)
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"
const UPDATE_VARIANT_TITLES =
  process.env.UPDATE_VARIANT_TITLES === "1" ||
  process.env.UPDATE_VARIANT_TITLES === "true"
const BATCH_SIZE = Math.max(
  1,
  parseInt(process.env.BATCH_SIZE || "100", 10) || 100
)
const LIMIT = Math.max(0, parseInt(process.env.LIMIT || "0", 10) || 0)

const TITLE_SEP = " — "

/**
 * Build a human inventory title that includes the product name.
 * Safe to re-run: already-prefixed titles are left as-is.
 */
export function buildInventoryItemTitle(
  productTitle: string | null | undefined,
  variantTitle: string | null | undefined
): string {
  const product = (productTitle ?? "").trim()
  const variant = (variantTitle ?? "").trim()

  if (!product && !variant) return "Untitled"
  if (!product) return variant
  if (!variant) return product

  // Exact match or already product-prefixed (em dash / hyphen / colon)
  if (variant === product) return product
  if (
    variant.startsWith(product + TITLE_SEP) ||
    variant.startsWith(product + " - ") ||
    variant.startsWith(product + ": ")
  ) {
    return variant
  }

  // Variant title already starts with product name (loose)
  if (variant.toLowerCase().startsWith(product.toLowerCase() + " ")) {
    return variant
  }

  return `${product}${TITLE_SEP}${variant}`
}

/** True when current title already matches the desired product-prefixed form. */
export function inventoryTitleNeedsUpdate(
  currentTitle: string | null | undefined,
  desiredTitle: string
): boolean {
  return (currentTitle ?? "").trim() !== desiredTitle.trim()
}

type VariantRow = {
  id: string
  title?: string | null
  sku?: string | null
  product_id?: string | null
  product?: { id?: string; title?: string | null } | null
  inventory_items?: Array<{ id?: string; title?: string | null; sku?: string | null }>
}

export default async function backfillInventoryItemTitles({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const inventoryService = container.resolve(Modules.INVENTORY) as {
    updateInventoryItems: (
      input:
        | { id: string; title?: string | null }
        | Array<{ id: string; title?: string | null }>
    ) => Promise<unknown>
  }
  const productService = container.resolve(Modules.PRODUCT) as {
    updateProductVariants?: (
      idOrData: string | Array<{ id: string; title?: string }>,
      data?: { title?: string }
    ) => Promise<unknown>
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Backfill inventory item titles")
  logger.info(`  format: Product${TITLE_SEP}Variant`)
  logger.info(`  DRY_RUN=${DRY_RUN}  UPDATE_VARIANT_TITLES=${UPDATE_VARIANT_TITLES}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // Load variants with product + linked inventory items.
  // Query graph may return product as nested object depending on link config;
  // fall back to a second product lookup if needed.
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "title",
      "sku",
      "product_id",
      "product.id",
      "product.title",
      "inventory_items.id",
      "inventory_items.title",
      "inventory_items.sku",
    ],
  })

  const rows = (variants ?? []) as VariantRow[]
  logger.info(`Loaded ${rows.length} variant(s).`)

  // Cache product titles for variants where product nest is missing
  const missingProductIds = Array.from(
    new Set(
      rows
        .filter((v) => !v.product?.title && v.product_id)
        .map((v) => v.product_id as string)
    )
  )
  const productTitleById = new Map<string, string>()
  if (missingProductIds.length) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title"],
      filters: { id: missingProductIds },
    })
    for (const p of products as Array<{ id: string; title?: string | null }>) {
      if (p.id) productTitleById.set(p.id, (p.title ?? "").trim())
    }
  }

  type InventoryUpdate = {
    id: string
    title: string
    from: string
    sku?: string | null
    productTitle: string
  }
  type VariantUpdate = {
    id: string
    title: string
    from: string
  }

  const inventoryUpdates: InventoryUpdate[] = []
  const variantUpdates: VariantUpdate[] = []
  const seenInventoryIds = new Set<string>()

  for (const variant of rows) {
    const productTitle =
      (variant.product?.title ?? "").trim() ||
      (variant.product_id
        ? productTitleById.get(variant.product_id) ?? ""
        : "")

    if (!productTitle) {
      continue
    }

    const desired = buildInventoryItemTitle(productTitle, variant.title)

    for (const item of variant.inventory_items ?? []) {
      if (!item?.id || seenInventoryIds.has(item.id)) continue
      seenInventoryIds.add(item.id)

      if (!inventoryTitleNeedsUpdate(item.title, desired)) continue

      inventoryUpdates.push({
        id: item.id,
        title: desired,
        from: (item.title ?? "").trim() || "(empty)",
        sku: item.sku ?? variant.sku,
        productTitle,
      })
    }

    if (UPDATE_VARIANT_TITLES) {
      if (inventoryTitleNeedsUpdate(variant.title, desired)) {
        variantUpdates.push({
          id: variant.id,
          title: desired,
          from: (variant.title ?? "").trim() || "(empty)",
        })
      }
    }
  }

  const invToApply =
    LIMIT > 0 ? inventoryUpdates.slice(0, LIMIT) : inventoryUpdates
  const varToApply =
    LIMIT > 0 ? variantUpdates.slice(0, LIMIT) : variantUpdates

  logger.info(
    `Inventory items needing rename: ${inventoryUpdates.length}` +
      (LIMIT > 0 ? ` (applying LIMIT=${LIMIT} → ${invToApply.length})` : "")
  )
  if (UPDATE_VARIANT_TITLES) {
    logger.info(
      `Variants needing rename: ${variantUpdates.length}` +
        (LIMIT > 0 ? ` (applying LIMIT=${LIMIT} → ${varToApply.length})` : "")
    )
  }

  // Sample a few for the log
  for (const sample of invToApply.slice(0, 8)) {
    logger.info(
      `  ${sample.sku ?? sample.id}: "${sample.from}" → "${sample.title}"`
    )
  }
  if (invToApply.length > 8) {
    logger.info(`  … and ${invToApply.length - 8} more inventory item(s)`)
  }

  if (DRY_RUN) {
    logger.info(
      `DRY_RUN=1 — no writes. Re-run without DRY_RUN to apply ${invToApply.length} inventory title(s)` +
        (UPDATE_VARIANT_TITLES ? ` and ${varToApply.length} variant title(s)` : "") +
        "."
    )
    return
  }

  let inventoryUpdated = 0
  for (let i = 0; i < invToApply.length; i += BATCH_SIZE) {
    const batch = invToApply.slice(i, i + BATCH_SIZE).map((u) => ({
      id: u.id,
      title: u.title,
    }))
    await inventoryService.updateInventoryItems(batch)
    inventoryUpdated += batch.length
    logger.info(
      `  Updated inventory items ${inventoryUpdated}/${invToApply.length}`
    )
  }

  let variantsUpdated = 0
  if (UPDATE_VARIANT_TITLES && varToApply.length) {
    // Prefer batch form when available; fall back to per-id.
    try {
      await productService.updateProductVariants?.(
        varToApply.map((u) => ({ id: u.id, title: u.title }))
      )
      variantsUpdated = varToApply.length
    } catch {
      for (const u of varToApply) {
        if (typeof productService.updateProductVariants === "function") {
          await productService.updateProductVariants(u.id, { title: u.title })
          variantsUpdated++
        }
      }
    }
    logger.info(`  Updated variant titles: ${variantsUpdated}`)
  }

  logger.info(
    `Done. Inventory titles updated: ${inventoryUpdated}` +
      (UPDATE_VARIANT_TITLES
        ? `, variant titles updated: ${variantsUpdated}`
        : " (variant titles left unchanged)") +
      "."
  )
  logger.info(
    "Refresh Medusa Admin → Inventory to see Product — size/flavour titles."
  )
}
