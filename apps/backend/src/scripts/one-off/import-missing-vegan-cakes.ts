/**
 * Import the 8 vegan cakes missing from the Magento → Medusa migration.
 *
 * Client site (eggfreecakebreak.com) has V1–V12. We only had V2, V5, V7, V12.
 * This script scrapes the missing product pages and creates full Medusa products:
 *   • title, handle, description, images, options, variants, GBP prices
 *   • sales channel + franchise + inventory levels + shipping profile
 *   • category vegan-cakes-dairy-free (+ heuristic extras)
 *   • dietary tags: Vegan, Dairy-free, Eggless
 *   • metadata matching existing vegan imports (scraped_*, storage_serving)
 *   • sponge values renamed to eggless display names (catalogue convention)
 *
 * Usage:
 *   cd apps/backend && npx medusa exec ./src/scripts/one-off/import-missing-vegan-cakes.ts
 *
 * Safe to re-run: existing handles are skipped (or only backfilled if incomplete).
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import axios from "axios"
import * as cheerio from "cheerio"
import StoreLocationStockLocationLink from "../../links/store-location-stock-location"
import ProductDietaryTagLink from "../../links/product-dietary-tag"
import { resolveProductCategoryHandles } from "../seed-cake-categories"
import {
  renameSpongeInTitle,
  renameSpongeOptionValue,
} from "./rename-sponge-flavours-to-eggless"

const IMPORT_STOCK_QTY = process.env.IMPORT_STOCK_QTY
  ? parseInt(process.env.IMPORT_STOCK_QTY, 10)
  : 50

const BASE_URL = "https://eggfreecakebreak.com"

/** Handles confirmed missing from local/prod catalogue (old site still live). */
const MISSING_HANDLES = [
  "vegan-fresh-fruit-cake-v1",
  "vegan-vanilla-cake-v3",
  "rainbow-sprinkle-cake-v4",
  "vegan-vanilla-cake-v6",
  "vegan-birthday-cake-v8",
  "simple-vegan-cake-v9",
  "vegan-cake-v10",
  "simple-vegan-cake-v11",
] as const

const DEFAULT_STORAGE =
  "Keep refrigerated and consume within 2 days. For best flavour, remove from the fridge 30–45 minutes before serving."

const SKIP_OPTION_RE =
  /date|time|message|instruction|qty|quantity|personalised|personalized|collection\s*date/i

interface ScrapedOption {
  title: string
  values: string[]
  priceAdjustments: Record<string, number>
}

interface ScrapedProduct {
  url: string
  title: string
  handle: string
  sku: string
  description: string
  overview: string
  metaDescription: string
  basePrice: number
  images: string[]
  options: ScrapedOption[]
  ingredients: string | null
  allergens: string | null
  dietary: string[]
}

function textOf($: cheerio.CheerioAPI, sel: string): string {
  return $(sel).first().text().replace(/\s+/g, " ").trim()
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
}

function extractLabeledField(blob: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*[:\\-]\\s*([^\\n]{3,400})`,
      "i"
    )
    const m = blob.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

function detectDietary(blob: string): string[] {
  const lower = blob.toLowerCase()
  const out = new Set<string>(["Eggless", "Vegan", "Dairy-free"])
  if (/gluten\s*-?\s*free/.test(lower)) out.add("Gluten-free")
  if (/\bhalal\b/.test(lower)) out.add("Halal")
  if (/nut\s*-?\s*free/.test(lower)) out.add("Nut-free")
  return [...out]
}

function normalizeSpongeOptions(options: ScrapedOption[]): ScrapedOption[] {
  return options.map((opt) => {
    if (!/sponge|flavour|flavor/i.test(opt.title)) return opt
    const values: string[] = []
    const priceAdjustments: Record<string, number> = {}
    for (const val of opt.values) {
      const renamed = renameSpongeOptionValue(val)
      values.push(renamed)
      priceAdjustments[renamed] =
        opt.priceAdjustments[val] ?? opt.priceAdjustments[renamed] ?? 0
    }
    // de-dupe after rename
    const seen = new Set<string>()
    const uniqueValues: string[] = []
    for (const v of values) {
      if (seen.has(v)) continue
      seen.add(v)
      uniqueValues.push(v)
    }
    return { title: opt.title, values: uniqueValues, priceAdjustments }
  })
}

async function scrapeProduct(url: string, logger: { info: Function; warn: Function }): Promise<ScrapedProduct | null> {
  const pageResponse = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    timeout: 25_000,
  })
  const $ = cheerio.load(pageResponse.data)

  const titleText = textOf($, ".page-title .base") || textOf($, "h1.page-title")
  if (!titleText) {
    logger.warn(`  no title on ${url}`)
    return null
  }

  const handle = url.substring(url.lastIndexOf("/") + 1).replace(/\/$/, "")
  const sku =
    textOf($, ".product.attribute.sku .value") ||
    `SKU-${handle.toUpperCase()}`

  const overview = textOf($, ".product.attribute.overview .value")
  const longDesc =
    textOf($, ".product.attribute.description .value") ||
    textOf($, "#description .value")
  const metaDesc = ($('meta[name="description"]').attr("content") || "").trim()
  const candidates = [longDesc, metaDesc, overview]
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^allergens?\s*:/i.test(s))
  candidates.sort((a, b) => b.length - a.length)
  const description = candidates[0] || "Delicious vegan cake from Cake Break."

  const rawPriceAmount = $("[data-price-type='finalPrice']")
    .first()
    .attr("data-price-amount")
  const basePrice = rawPriceAmount ? parseFloat(rawPriceAmount) : 0
  if (!basePrice || Number.isNaN(basePrice)) {
    logger.warn(`  no price on ${url} — defaulting to 0 (will still import)`)
  }

  const images: string[] = []
  $("script[type='text/x-magento-init']").each((_, scriptEl) => {
    const text = $(scriptEl).text()
    if (!text.includes("mage/gallery/gallery")) return
    try {
      const parsed = JSON.parse(text)
      const galleryConfig = Object.values(parsed).find(
        (cfg: any) => cfg["mage/gallery/gallery"]
      ) as any
      const galleryData = galleryConfig?.["mage/gallery/gallery"]?.data || []
      for (const imgItem of galleryData) {
        if (imgItem.full && !images.includes(imgItem.full)) {
          images.push(imgItem.full)
        } else if (imgItem.img && !images.includes(imgItem.img)) {
          images.push(imgItem.img)
        }
      }
    } catch {
      // ignore
    }
  })
  if (images.length === 0) {
    const main =
      $(".gallery-placeholder__image").first().attr("data-src") ||
      $(".gallery-placeholder__image").first().attr("src") ||
      $('meta[property="og:image"]').attr("content")
    if (main) images.push(main)
  }

  const options: ScrapedOption[] = []
  const parsedOptionNames = new Set<string>()
  $(".product-options-wrapper select").each((_, selectEl) => {
    const select = $(selectEl)
    let name = select.closest(".field").find(".label span").first().text().trim()
    if (!name) name = select.attr("name") || ""
    if (!name || SKIP_OPTION_RE.test(name)) return

    let uniqueName = name
    let count = 1
    while (parsedOptionNames.has(uniqueName)) {
      count++
      uniqueName = `${name} ${count}`
    }
    parsedOptionNames.add(uniqueName)

    const values: string[] = []
    const priceAdjustments: Record<string, number> = {}
    select.find("option").each((__, optEl) => {
      const opt = $(optEl)
      let val = decodeHtmlEntities(opt.text().trim())
      if (!val || /please select/i.test(val)) return
      values.push(val)
      const priceAttr = opt.attr("price")
      priceAdjustments[val] = priceAttr ? parseFloat(priceAttr) : 0
    })
    if (values.length > 0) {
      options.push({ title: uniqueName, values, priceAdjustments })
    }
  })

  const normalizedOptions = normalizeSpongeOptions(options)

  // Specs table / labeled fields
  const rawAttributeMap: Record<string, string> = {}
  $(
    "#product-attribute-specs-table tr, .additional-attributes tr, table.data.table.additional-attributes tr"
  ).each((_, tr) => {
    const th = $(tr).find("th").text().replace(/\s+/g, " ").trim()
    const td = $(tr).find("td").text().replace(/\s+/g, " ").trim()
    if (th && td) rawAttributeMap[th] = td
  })

  const blob = [
    titleText,
    overview,
    longDesc,
    metaDesc,
    ...Object.values(rawAttributeMap),
  ]
    .filter(Boolean)
    .join("\n")

  let ingredients: string | null = null
  let allergens: string | null = null
  for (const [key, val] of Object.entries(rawAttributeMap)) {
    if (/ingredient/i.test(key) && val) ingredients = val
    if (/allergen/i.test(key) && val) allergens = val
  }
  ingredients =
    ingredients ||
    extractLabeledField(blob, ["Ingredients?", "Ingredient list"])
  allergens =
    allergens ||
    extractLabeledField(blob, ["Allergens?", "Allergy advice", "Allergen information"])

  const dietary = detectDietary(blob)

  logger.info(
    `  scraped ${titleText} | £${basePrice} | imgs=${images.length} | opts=${normalizedOptions
      .map((o) => `${o.title}(${o.values.length})`)
      .join(", ")}`
  )

  return {
    url,
    title: titleText,
    handle,
    sku,
    description,
    overview,
    metaDescription: metaDesc,
    basePrice: basePrice || 0,
    images,
    options: normalizedOptions,
    ingredients,
    allergens,
    dietary,
  }
}

function buildVariants(item: ScrapedProduct): any[] {
  const variants: any[] = []
  const optionsList = item.options

  if (optionsList.length === 0) {
    variants.push({
      title: "Standard",
      sku: item.sku,
      prices: [{ amount: item.basePrice, currency_code: "gbp" }],
    })
    return variants
  }

  if (optionsList.length === 1) {
    const opt = optionsList[0]
    for (const val of opt.values) {
      const adj = opt.priceAdjustments[val] || 0
      variants.push({
        title: renameSpongeInTitle(val),
        sku: `${item.sku}-${val.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`,
        options: { [opt.title]: val },
        prices: [{ amount: item.basePrice + adj, currency_code: "gbp" }],
      })
    }
    return variants
  }

  const opt1 = optionsList[0]
  const opt2 = optionsList[1]
  const extraOptions: Record<string, string> = {}
  for (let i = 2; i < optionsList.length; i++) {
    extraOptions[optionsList[i].title] = optionsList[i].values[0]
  }

  for (const val1 of opt1.values) {
    const adj1 = opt1.priceAdjustments[val1] || 0
    for (const val2 of opt2.values) {
      const adj2 = opt2.priceAdjustments[val2] || 0
      const title = renameSpongeInTitle(`${val1} / ${val2}`)
      variants.push({
        title,
        sku: `${item.sku}-${val1
          .replace(/[^a-zA-Z0-9]/g, "")
          .substring(0, 3)}-${val2
          .replace(/[^a-zA-Z0-9]/g, "")
          .substring(0, 3)}`.toUpperCase(),
        options: {
          [opt1.title]: val1,
          [opt2.title]: val2,
          ...extraOptions,
        },
        prices: [
          {
            amount: item.basePrice + adj1 + adj2,
            currency_code: "gbp",
          },
        ],
      })
    }
  }
  return variants
}

export default async function importMissingVeganCakes({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const pgConnection = container.resolve("__pg_connection__")

  const productService = container.resolve(Modules.PRODUCT) as any
  const inventoryService = container.resolve(Modules.INVENTORY)
  const pricingService = container.resolve(Modules.PRICING)
  const franchiseService = container.resolve("franchise") as any
  const dietaryTagService = container.resolve("dietary_tag") as any

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Import missing vegan cakes (V1,V3,V4,V6,V8–V11)")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // ── Franchise ────────────────────────────────────────────────────────────
  const existingFranchises = await franchiseService.listFranchises()
  const franchise = existingFranchises[0]
  if (!franchise) {
    logger.error("No franchise found. Run franchise seed first.")
    return
  }
  logger.info(`Franchise: ${franchise.id}`)

  // ── Sales channel ────────────────────────────────────────────────────────
  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
    filters: { name: "Default Sales Channel" },
  })
  const salesChannelId = salesChannels?.[0]?.id as string | undefined
  if (!salesChannelId) {
    logger.error("Default Sales Channel not found.")
    return
  }

  // ── Shipping ─────────────────────────────────────────────────────────────
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const defaultProfileId = shippingProfiles?.[0]?.id as string | undefined

  // ── Stock locations ──────────────────────────────────────────────────────
  const franchiseStoreLocations = await franchiseService.listStoreLocations(
    { franchise_id: franchise.id },
    { select: ["id"] }
  )
  const franchiseStoreLocationIds = franchiseStoreLocations.map(
    (sl: { id: string }) => sl.id
  )
  let stockLocationIds: string[] = []
  if (franchiseStoreLocationIds.length) {
    const { data: stockLinks } = await query.graph({
      entity: StoreLocationStockLocationLink.entryPoint,
      fields: ["stock_location_id"],
      filters: { store_location_id: franchiseStoreLocationIds },
    })
    stockLocationIds = Array.from(
      new Set(
        (stockLinks as Array<{ stock_location_id?: string }>)
          .map((l) => l.stock_location_id)
          .filter((id): id is string => Boolean(id))
      )
    )
  }
  logger.info(
    `Stock locations: ${stockLocationIds.length} (stores=${franchiseStoreLocationIds.length})`
  )

  // ── Vegan category ───────────────────────────────────────────────────────
  const categories = await productService.listProductCategories(
    { handle: "vegan-cakes-dairy-free" },
    { take: 5, select: ["id", "handle", "name"] }
  )
  const veganCategoryId = categories?.[0]?.id as string | undefined
  if (!veganCategoryId) {
    logger.error(
      "Category vegan-cakes-dairy-free not found. Run seed-cake-categories first."
    )
    return
  }
  logger.info(`Vegan category: ${veganCategoryId}`)

  // ── Dietary tags ─────────────────────────────────────────────────────────
  const tagSlugs = ["vegan", "dairy-free", "eggless", "gluten-free", "halal", "nut-free"]
  const tagBySlug = new Map<string, { id: string; slug: string; name: string }>()
  for (const slug of tagSlugs) {
    const [existing] = await dietaryTagService.listDietary_tags({ slug })
    if (existing && !existing.deleted_at) {
      tagBySlug.set(slug, existing)
    }
  }
  // Prefer non-deleted eggless if duplicates exist
  logger.info(
    `Dietary tags: ${[...tagBySlug.keys()].join(", ") || "(none — will skip tag links)"}`
  )

  const { data: existingDietLinks } = await query.graph({
    entity: ProductDietaryTagLink.entryPoint,
    fields: ["product_id", "dietary_tag_id"],
  })
  const dietLinked = new Set(
    (
      existingDietLinks as Array<{
        product_id?: string
        dietary_tag_id?: string
      }>
    ).map((l) => `${l.product_id}::${l.dietary_tag_id}`)
  )

  // ── Scrape ───────────────────────────────────────────────────────────────
  const scraped: ScrapedProduct[] = []
  for (const handle of MISSING_HANDLES) {
    const url = `${BASE_URL}/${handle}`
    logger.info(`Scraping ${url}`)
    try {
      const item = await scrapeProduct(url, logger)
      if (item) scraped.push(item)
      await new Promise((r) => setTimeout(r, 200))
    } catch (err: any) {
      logger.error(`  scrape failed: ${err.message}`)
    }
  }
  logger.info(`Scraped ${scraped.length}/${MISSING_HANDLES.length} products`)

  // ── Ingest ───────────────────────────────────────────────────────────────
  let created = 0
  let skipped = 0
  let errors = 0

  for (const item of scraped) {
    try {
      const [existing] = await productService.listProducts(
        { handle: item.handle },
        { take: 1, select: ["id", "handle", "title"] }
      )
      if (existing) {
        logger.info(`Skip existing: ${item.handle} (${existing.id})`)
        // Still ensure category + dietary tags on existing
        await ensureCategoryAndTags(
          productService,
          remoteLink,
          existing.id,
          item,
          veganCategoryId,
          tagBySlug,
          dietLinked,
          logger
        )
        skipped++
        continue
      }

      const productOptions = item.options.map((opt) => ({
        title: opt.title,
        values: opt.values,
      }))
      const variants = buildVariants(item)

      const metadata: Record<string, unknown> = {
        supports_inscription: "true",
        supports_photo_upload: "false",
        scraped_at: new Date().toISOString(),
        scraped_source: BASE_URL,
        scraped_dietary: item.dietary,
        scraped_overview: item.overview || undefined,
        scraped_meta_description: item.metaDescription || undefined,
        storage_serving: DEFAULT_STORAGE,
      }
      if (item.ingredients) metadata.ingredients = item.ingredients
      if (item.allergens) metadata.allergens = item.allergens

      logger.info(
        `Creating ${item.title} (${variants.length} variants, ${item.images.length} images)…`
      )

      const createdProduct = await productService.createProducts({
        title: item.title,
        handle: item.handle,
        description: item.description,
        thumbnail: item.images[0] || undefined,
        images: item.images.map((url) => ({ url })),
        options: productOptions,
        variants,
        status: "published" as any,
        metadata,
        category_ids: buildCategoryIds(
          item.title,
          item.handle,
          veganCategoryId,
          productService
        ),
      })

      // createProducts may return object or array depending on Medusa version
      const product = Array.isArray(createdProduct)
        ? createdProduct[0]
        : createdProduct

      // Prices
      const createdVariants = product.variants ?? []
      const priceSetLinks: Array<{
        [Modules.PRODUCT]: { variant_id: string }
        [Modules.PRICING]: { price_set_id: string }
      }> = []
      for (let i = 0; i < createdVariants.length; i++) {
        const sourcePrices = variants[i]?.prices
        if (!sourcePrices?.length) continue
        const priceSet = await pricingService.createPriceSets({
          prices: sourcePrices,
        })
        priceSetLinks.push({
          [Modules.PRODUCT]: { variant_id: createdVariants[i].id },
          [Modules.PRICING]: { price_set_id: priceSet.id },
        })
      }
      if (priceSetLinks.length) {
        await remoteLink.create(priceSetLinks)
      }

      // Sales channel
      await remoteLink.create({
        [Modules.PRODUCT]: { product_id: product.id },
        [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
      })

      // Franchise
      await remoteLink.create({
        franchise: { franchise_id: franchise.id },
        [Modules.PRODUCT]: { product_id: product.id },
      })

      // Inventory
      const managedVariants = (product.variants ?? []).filter(
        (v: { manage_inventory?: boolean }) => v.manage_inventory !== false
      )
      if (managedVariants.length && stockLocationIds.length) {
        const createdItems = await inventoryService.createInventoryItems(
          managedVariants.map(
            (v: { sku?: string | null; title?: string | null }) => ({
              sku: v.sku ?? undefined,
              title: v.title ?? undefined,
            })
          )
        )
        const variantInventoryLinks = managedVariants.map(
          (v: { id: string }, index: number) => ({
            [Modules.PRODUCT]: { variant_id: v.id },
            [Modules.INVENTORY]: { inventory_item_id: createdItems[index].id },
            data: { required_quantity: 1 },
          })
        )
        await remoteLink.create(variantInventoryLinks)
        const levelsToCreate = createdItems.flatMap((invItem) =>
          stockLocationIds.map((stockLocationId) => ({
            inventory_item_id: invItem.id,
            location_id: stockLocationId,
            stocked_quantity: IMPORT_STOCK_QTY,
          }))
        )
        await inventoryService.createInventoryLevels(levelsToCreate)
      }

      // Shipping profile
      if (defaultProfileId) {
        await pgConnection.raw(
          `
          INSERT INTO product_shipping_profile (id, product_id, shipping_profile_id)
          VALUES (gen_random_uuid()::text, ?, ?)
          ON CONFLICT DO NOTHING
        `,
          [product.id, defaultProfileId]
        )
      }

      // Force category (createProducts category_ids can be flaky across versions)
      await ensureCategoryAndTags(
        productService,
        remoteLink,
        product.id,
        item,
        veganCategoryId,
        tagBySlug,
        dietLinked,
        logger
      )

      created++
      logger.info(`✓ Created ${item.handle} → ${product.id}`)
    } catch (err: any) {
      errors++
      logger.error(`Failed ${item.handle}: ${err.message}`)
      if (err.stack) logger.error(err.stack)
    }
  }

  // ── Clean polluted non-vegan links on vegan category ────────────────────
  // Magento scrape once linked related products (Bluey, DH*, …) into every
  // category including vegan. Keep only true V1–V12 handles here.
  const CANONICAL_VEGAN_HANDLES = [
    ...MISSING_HANDLES,
    "vegan-cake-v2",
    "vegan-birthday-cake-for-mother-v5",
    "vegan-vanilla-cake-v7",
    "vegan-birthday-cake-v12",
  ]
  let cleaned = 0
  try {
    const result = await pgConnection.raw(
      `
      DELETE FROM product_category_product pcp
      USING product p, product_category pc
      WHERE pcp.product_id = p.id
        AND pcp.product_category_id = pc.id
        AND pc.handle = 'vegan-cakes-dairy-free'
        AND p.handle <> ALL(?)
        AND (p.title IS NULL OR p.title NOT ILIKE '%vegan%')
      RETURNING p.handle
    `,
      [CANONICAL_VEGAN_HANDLES]
    )
    const removed = result?.rows ?? result ?? []
    cleaned = Array.isArray(removed) ? removed.length : 0
    if (cleaned) {
      logger.info(
        `Cleaned ${cleaned} non-vegan product(s) from vegan-cakes-dairy-free`
      )
      for (const row of removed.slice(0, 20)) {
        logger.info(`  - removed ${row.handle}`)
      }
    } else {
      logger.info("Vegan category already clean (no polluted links).")
    }
  } catch (e: any) {
    logger.warn(`Category cleanup failed: ${e.message}`)
  }

  // ── Verify ───────────────────────────────────────────────────────────────
  const present: string[] = []
  const stillMissing: string[] = []
  for (const h of CANONICAL_VEGAN_HANDLES) {
    const [p] = await productService.listProducts(
      { handle: h },
      { take: 1, select: ["id", "handle", "status"] }
    )
    if (p) present.push(h)
    else stillMissing.push(h)
  }

  // Direct SQL count is more reliable for category membership
  let categoryCount = 0
  let categoryHandles: string[] = []
  try {
    const rows = await pgConnection.raw(
      `
      SELECT p.handle
      FROM product_category_product pcp
      JOIN product p ON p.id = pcp.product_id
      WHERE pcp.product_category_id = ?
      ORDER BY p.handle
    `,
      [veganCategoryId]
    )
    const list = rows?.rows ?? rows ?? []
    categoryHandles = list.map((r: { handle: string }) => r.handle)
    categoryCount = categoryHandles.length
  } catch {
    // ignore
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  created=${created} skipped=${skipped} errors=${errors} cleaned=${cleaned}`)
  logger.info(`  V1–V12 present in DB: ${present.length}/12`)
  if (stillMissing.length) {
    logger.info(`  still missing: ${stillMissing.join(", ")}`)
  }
  logger.info(`  products in vegan category: ${categoryCount}`)
  if (categoryHandles.length) {
    logger.info(`  vegan category handles: ${categoryHandles.join(", ")}`)
  }
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

function buildCategoryIds(
  title: string,
  handle: string,
  veganCategoryId: string,
  _productService: any
): string[] {
  // Heuristic handles from shared resolver — we only know vegan id for sure here.
  // Always include vegan; shape-based categories are applied via ensureCategoryAndTags.
  void title
  void handle
  void _productService
  return [veganCategoryId]
}

async function ensureCategoryAndTags(
  productService: any,
  remoteLink: any,
  productId: string,
  item: ScrapedProduct,
  veganCategoryId: string,
  tagBySlug: Map<string, { id: string; slug: string; name: string }>,
  dietLinked: Set<string>,
  logger: { info: Function; warn: Function }
) {
  // Resolve category IDs from heuristics (vegan + square/round if title matches)
  const handles = resolveProductCategoryHandles(item.title, item.handle)
  const cats = await productService.listProductCategories(
    {},
    { take: 200, select: ["id", "handle"] }
  )
  const idByHandle = new Map<string, string>(
    (cats || []).map((c: { id: string; handle: string }) => [c.handle, c.id])
  )
  const categoryIds = new Set<string>([veganCategoryId])
  for (const h of handles) {
    const id = idByHandle.get(h)
    if (id) categoryIds.add(id)
  }

  try {
    await productService.updateProducts(productId, {
      category_ids: [...categoryIds],
      status: "published",
    })
    logger.info(
      `  categories → ${[...categoryIds]
        .map((id) => {
          for (const [h, i] of idByHandle) if (i === id) return h
          return id
        })
        .join(", ")}`
    )
  } catch (e: any) {
    logger.warn(`  category update failed: ${e.message}`)
  }

  // Dietary tags from scraped list
  const slugMap: Record<string, string> = {
    Vegan: "vegan",
    "Dairy-free": "dairy-free",
    Eggless: "eggless",
    "Gluten-free": "gluten-free",
    Halal: "halal",
    "Nut-free": "nut-free",
  }
  for (const name of item.dietary) {
    const slug = slugMap[name] || name.toLowerCase()
    const tag = tagBySlug.get(slug)
    if (!tag) continue
    const key = `${productId}::${tag.id}`
    if (dietLinked.has(key)) continue
    try {
      await remoteLink.create({
        [Modules.PRODUCT]: { product_id: productId },
        dietary_tag: { dietary_tag_id: tag.id },
      })
      dietLinked.add(key)
      logger.info(`  tag → ${slug}`)
    } catch (e: any) {
      if (!/already|duplicate|exists/i.test(e.message || "")) {
        logger.warn(`  tag link ${slug} failed: ${e.message}`)
      }
    }
  }
}
