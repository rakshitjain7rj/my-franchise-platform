/**
 * fix-cake-card-placeholders.ts
 *
 * Production/local repair for product-detail cards:
 *   1. Clear bulk-backfill placeholder ingredients / allergens
 *      (Flour, Sugar, Butter, Milk… / Gluten, Dairy) so vegan cakes do not
 *      falsely list dairy.
 *   2. Ensure dietary tags exist (Eggless, Vegan, Dairy-free, …).
 *   3. Link Eggless to every product (brand is egg-free).
 *   4. Link Vegan + Dairy-free when title/handle/metadata indicate vegan.
 *
 * Does NOT invent real ingredient lists — Magento never published them.
 * Does NOT overwrite non-placeholder ingredients/allergens staff entered.
 *
 * Usage (local):
 *   cd apps/backend && npx medusa exec ./src/scripts/one-off/fix-cake-card-placeholders.ts
 *
 * Usage (production Dokploy → backend Terminal):
 *   cd /app && npx medusa exec ./src/scripts/one-off/fix-cake-card-placeholders.ts
 *
 * Optional:
 *   FIX_DRY_RUN=1   — log only, no writes
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import ProductDietaryTagLink from "../../links/product-dietary-tag"

const PLACEHOLDER_INGREDIENTS = [
  "Flour, Sugar, Butter, Milk, Raising agents, Natural flavourings",
  "Premium Royal Belgian Chocolate elements, Organic Flour, Cane Sugar, Sweet Butter.",
]

const PLACEHOLDER_ALLERGENS = ["Gluten, Dairy", "Nuts, Gluten, Dairy"]

const TAG_DEFS = [
  {
    name: "Eggless",
    slug: "eggless",
    description: "Prepared without eggs. Uses plant-based binders.",
  },
  {
    name: "Vegan",
    slug: "vegan",
    description: "Plant-based recipe with no animal products.",
  },
  {
    name: "Dairy-free",
    slug: "dairy-free",
    description: "Made without dairy milk or butter.",
  },
  {
    name: "Gluten-free",
    slug: "gluten-free",
    description: "Made without gluten-containing grains.",
  },
] as const

type ProductRow = {
  id: string
  title: string
  handle?: string | null
  material?: string | null
  metadata?: Record<string, unknown> | null
}

function isPlaceholderIngredients(value: unknown): boolean {
  if (typeof value !== "string") return false
  const t = value.trim()
  if (!t) return false
  if (PLACEHOLDER_INGREDIENTS.some((p) => p === t)) return true
  if (
    /^Premium .+ elements, Organic Flour, Cane Sugar, Sweet Butter\.?$/i.test(t)
  ) {
    return true
  }
  return false
}

function allergenString(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean).join(", ")
  }
  return ""
}

function isPlaceholderAllergens(value: unknown): boolean {
  const joined = allergenString(value)
  return Boolean(joined) && PLACEHOLDER_ALLERGENS.includes(joined)
}

function isVeganProduct(product: ProductRow): boolean {
  const handle = (product.handle || "").toLowerCase()
  const title = (product.title || "").toLowerCase()
  const meta = product.metadata || {}
  const scraped = meta.scraped_dietary
  if (Array.isArray(scraped) && scraped.some((t) => /vegan/i.test(String(t)))) {
    return true
  }
  if (typeof scraped === "string" && /vegan/i.test(scraped)) return true
  if (/\bvegan\b/.test(handle) || /\bvegan\b/.test(title)) return true
  if (/dairy[-\s]?free/.test(handle) || /dairy[-\s]?free/.test(title)) {
    return true
  }
  return false
}

function isGlutenFreeProduct(product: ProductRow): boolean {
  const blob = `${product.handle || ""} ${product.title || ""}`.toLowerCase()
  return /gluten[-\s]?free/.test(blob)
}

async function listAllProducts(
  productService: {
    listAndCountProducts?: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<[ProductRow[], number]>
    listProducts: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<ProductRow[]>
  }
): Promise<ProductRow[]> {
  const pageSize = 100
  const all: ProductRow[] = []

  if (typeof productService.listAndCountProducts === "function") {
    let offset = 0
    for (;;) {
      const [batch, count] = await productService.listAndCountProducts(
        {},
        {
          select: ["id", "title", "handle", "material", "metadata"],
          take: pageSize,
          skip: offset,
        }
      )
      all.push(...batch)
      offset += batch.length
      if (!batch.length || offset >= count) break
    }
    return all
  }

  // Fallback: keep paging until a short page
  let offset = 0
  for (;;) {
    const batch = await productService.listProducts(
      {},
      {
        select: ["id", "title", "handle", "material", "metadata"],
        take: pageSize,
        skip: offset,
      }
    )
    all.push(...batch)
    if (batch.length < pageSize) break
    offset += batch.length
  }
  return all
}

export default async function fixCakeCardPlaceholders({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const productService = container.resolve(Modules.PRODUCT) as {
    listAndCountProducts?: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<[ProductRow[], number]>
    listProducts: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<ProductRow[]>
    updateProducts: (
      id: string,
      data: Record<string, unknown>
    ) => Promise<unknown>
  }
  const dietaryTagService = container.resolve("dietary_tag") as {
    listDietary_tags: (
      filters?: Record<string, unknown>
    ) => Promise<Array<{ id: string; name: string; slug: string }>>
    createDietary_tags: (data: {
      name: string
      slug: string
      description?: string
      is_active?: boolean
    }) => Promise<{ id: string; name: string; slug: string }>
  }

  const dryRun = process.env.FIX_DRY_RUN === "1"

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Fix cake card placeholders + dietary tags")
  logger.info(`  dryRun=${dryRun}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // ── Ensure tags ──────────────────────────────────────────────────────────
  const tagBySlug = new Map<string, { id: string; name: string; slug: string }>()
  for (const def of TAG_DEFS) {
    const [existing] = await dietaryTagService.listDietary_tags({
      slug: def.slug,
    })
    const tag =
      existing ??
      (dryRun
        ? { id: `dry_${def.slug}`, name: def.name, slug: def.slug }
        : await dietaryTagService.createDietary_tags({
            name: def.name,
            slug: def.slug,
            description: def.description,
            is_active: true,
          }))
    tagBySlug.set(def.slug, tag)
    logger.info(`  tag ${tag.slug}=${tag.id}`)
  }

  const eggless = tagBySlug.get("eggless")!
  const vegan = tagBySlug.get("vegan")!
  const dairyFree = tagBySlug.get("dairy-free")!
  const glutenFree = tagBySlug.get("gluten-free")!

  // ── Existing links ───────────────────────────────────────────────────────
  const { data: existingLinks } = await query.graph({
    entity: ProductDietaryTagLink.entryPoint,
    fields: ["product_id", "dietary_tag_id"],
  })
  const linked = new Set(
    (existingLinks as Array<{ product_id?: string; dietary_tag_id?: string }>).map(
      (l) => `${l.product_id}::${l.dietary_tag_id}`
    )
  )

  const products = await listAllProducts(productService)
  logger.info(`  products scanned: ${products.length}`)

  let clearedIngredients = 0
  let clearedAllergens = 0
  let productsUpdated = 0
  let linksCreated = 0
  let veganTagged = 0
  let egglessTagged = 0
  let glutenFreeTagged = 0

  async function ensureLink(
    productId: string,
    tagId: string,
    label: string
  ): Promise<boolean> {
    const key = `${productId}::${tagId}`
    if (linked.has(key)) return false
    linked.add(key)
    if (dryRun || tagId.startsWith("dry_")) {
      linksCreated++
      return true
    }
    try {
      await remoteLink.create({
        [Modules.PRODUCT]: { product_id: productId },
        dietary_tag: { dietary_tag_id: tagId },
      })
      linksCreated++
      return true
    } catch (e: any) {
      if (!/already|duplicate|exists/i.test(e.message || "")) {
        logger.warn(`  link fail ${label}: ${e.message}`)
      }
      return false
    }
  }

  for (const product of products) {
    const prevMeta =
      product.metadata && typeof product.metadata === "object"
        ? { ...(product.metadata as Record<string, unknown>) }
        : {}
    const nextMeta: Record<string, unknown> = { ...prevMeta }
    let nextMaterial: string | null | undefined = undefined
    let dirty = false

    const prevIngredients =
      (typeof product.material === "string" && product.material.trim()) ||
      (typeof prevMeta.ingredients === "string" && prevMeta.ingredients.trim()) ||
      (typeof prevMeta.material === "string" &&
        String(prevMeta.material).trim()) ||
      ""

    if (
      isPlaceholderIngredients(prevIngredients) ||
      isPlaceholderIngredients(prevMeta.ingredients) ||
      isPlaceholderIngredients(prevMeta.material) ||
      isPlaceholderIngredients(product.material)
    ) {
      nextMeta.ingredients = ""
      nextMeta.material = ""
      nextMaterial = null
      clearedIngredients++
      dirty = true
    }

    if (isPlaceholderAllergens(prevMeta.allergens)) {
      nextMeta.allergens = ""
      clearedAllergens++
      dirty = true
    }

    // Audit markers (harmless; helps verify fix ran on prod)
    nextMeta.cake_card_fix_at = new Date().toISOString()

    if (dirty || nextMeta.cake_card_fix_at !== prevMeta.cake_card_fix_at) {
      // Always stamp fix time when we touch tags path; only write product when meta dirty
      if (dirty) {
        productsUpdated++
        if (!dryRun) {
          await productService.updateProducts(product.id, {
            metadata: nextMeta,
            ...(nextMaterial !== undefined ? { material: nextMaterial } : {}),
          })
        }
      }
    }

    // ── Dietary links ────────────────────────────────────────────────────
    if (await ensureLink(product.id, eggless.id, `${product.handle}→eggless`)) {
      egglessTagged++
    }

    if (isVeganProduct(product)) {
      const a = await ensureLink(product.id, vegan.id, `${product.handle}→vegan`)
      const b = await ensureLink(
        product.id,
        dairyFree.id,
        `${product.handle}→dairy-free`
      )
      if (a || b) veganTagged++
    }

    if (isGlutenFreeProduct(product)) {
      if (
        await ensureLink(
          product.id,
          glutenFree.id,
          `${product.handle}→gluten-free`
        )
      ) {
        glutenFreeTagged++
      }
    }
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  productsScanned=${products.length}`)
  logger.info(
    `  clearedIngredients=${clearedIngredients} clearedAllergens=${clearedAllergens} productsUpdated=${productsUpdated}`
  )
  logger.info(
    `  linksCreated=${linksCreated} newEggless=${egglessTagged} veganProductsTouched=${veganTagged} glutenFreeTouched=${glutenFreeTagged}`
  )
  logger.info(
    "  Note: empty ingredients after clear is expected — source site has no lists."
  )
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
