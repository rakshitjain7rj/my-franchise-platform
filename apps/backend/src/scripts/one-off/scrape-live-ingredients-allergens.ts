/**
 * scrape-live-ingredients-allergens.ts
 *
 * Re-scrapes each catalogue product page on eggfreecakebreak.com with Cheerio
 * and backfills only what can be derived *accurately* from the live HTML:
 *
 *   • Dietary claims (Eggless / Vegan / Dairy-free / Gluten-free / Halal)
 *     from title, overview, description, meta description, and category
 *     membership (e.g. /cakes/vegan-cakes-dairy-free).
 *   • Ingredients / allergens only when the page has an explicit field or a
 *     labeled "Ingredients:" / "Allergens:" line. Magento product pages for
 *     Cake Break currently do NOT publish per-product ingredient lists, so
 *     these stay empty rather than inventing placeholder text.
 *
 * Also removes the generic placeholder ingredients/allergens that were bulk-
 * applied earlier (Flour, Sugar… / Gluten, Dairy) so the storefront does not
 * present fabricated data as scraped fact.
 *
 * Usage:
 *   cd apps/backend && npx medusa exec ./src/scripts/one-off/scrape-live-ingredients-allergens.ts
 *
 * Env:
 *   SCRAPE_LIMIT=50          — max products to process (default: all)
 *   SCRAPE_DRY_RUN=1         — log only, no writes
 *   SCRAPE_CONCURRENCY=3     — parallel page fetches
 *   SCRAPE_DELAY_MS=200      — pause between requests (per worker)
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import axios from "axios"
import * as cheerio from "cheerio"
import ProductDietaryTagLink from "../../links/product-dietary-tag"

const BASE_URL = "https://eggfreecakebreak.com"

/** Placeholder values from the earlier bulk backfill — never treat as real scrape data. */
const PLACEHOLDER_INGREDIENTS = [
  "Flour, Sugar, Butter, Milk, Raising agents, Natural flavourings",
  "Premium Royal Belgian Chocolate elements, Organic Flour, Cane Sugar, Sweet Butter.",
]
const PLACEHOLDER_ALLERGENS = ["Gluten, Dairy", "Nuts, Gluten, Dairy"]

const CATEGORY_URLS: Array<{ url: string; tags: string[] }> = [
  {
    url: `${BASE_URL}/cakes/vegan-cakes-dairy-free`,
    tags: ["Vegan", "Dairy-free", "Eggless"],
  },
]

type DietarySlug =
  | "eggless"
  | "vegan"
  | "dairy-free"
  | "gluten-free"
  | "halal"
  | "nut-free"

const TAG_DEFS: Array<{
  name: string
  slug: DietarySlug
  description: string
}> = [
  {
    name: "Eggless",
    slug: "eggless",
    description: "Prepared without eggs (Cake Break egg-free range).",
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
  {
    name: "Halal",
    slug: "halal",
    description: "Halal-suitable preparation claim from source listing.",
  },
  {
    name: "Nut-free",
    slug: "nut-free",
    description: "Prepared without nuts (check kitchen cross-contact).",
  },
]

type ScrapedPage = {
  handle: string
  title: string
  overview: string
  description: string
  metaDescription: string
  sku: string
  ingredients: string | null
  allergens: string | null
  dietaryNames: string[]
  rawAttributeMap: Record<string, string>
  ok: boolean
  error?: string
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function normalizeHandle(handle: string): string {
  return handle.replace(/^\/+|\/+$/g, "").toLowerCase()
}

function isPlaceholderIngredients(value: unknown): boolean {
  if (typeof value !== "string") return false
  const t = value.trim()
  if (!t) return false
  if (PLACEHOLDER_INGREDIENTS.some((p) => p === t)) return true
  // Seed premium pattern: "Premium … elements, Organic Flour, Cane Sugar, Sweet Butter."
  if (/^Premium .+ elements, Organic Flour, Cane Sugar, Sweet Butter\.?$/i.test(t)) {
    return true
  }
  return false
}

function isPlaceholderAllergens(value: unknown): boolean {
  if (typeof value === "string") {
    return PLACEHOLDER_ALLERGENS.includes(value.trim())
  }
  if (Array.isArray(value)) {
    const joined = value.map(String).map((s) => s.trim()).join(", ")
    return PLACEHOLDER_ALLERGENS.includes(joined)
  }
  return false
}

function textOf($: cheerio.CheerioAPI, sel: string): string {
  return $(sel).first().text().replace(/\s+/g, " ").trim()
}

function extractLabeledField(blob: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*[:\\-]\\s*([^\\n\\r|]+)`,
      "i"
    )
    const m = blob.match(re)
    if (m?.[1]) {
      const v = m[1].trim().replace(/\s+/g, " ")
      if (v.length > 2 && v.length < 500) return v
    }
  }
  return null
}

const KNOWN_ALLERGEN_TOKENS = [
  "milk",
  "dairy",
  "wheat",
  "gluten",
  "nuts",
  "nut",
  "peanut",
  "peanuts",
  "tree nuts",
  "egg",
  "eggs",
  "soya",
  "soy",
  "sesame",
  "sulphites",
  "sulfites",
  "lupin",
  "celery",
  "mustard",
  "fish",
  "crustaceans",
  "molluscs",
  "mollusks",
]

function cleanAllergenList(raw: string | null, title = ""): string | null {
  if (!raw) return null
  let text = raw.replace(/\s+/g, " ").trim()
  if (title) {
    const t = title.replace(/^\([^)]+\)\s*/, "").trim()
    if (t && text.toLowerCase().endsWith(t.toLowerCase())) {
      text = text.slice(0, -t.length).trim().replace(/[,\s]+$/, "")
    }
  }
  const parts = text
    .split(/,|\/|;|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
  const known: string[] = []
  for (const p of parts) {
    const low = p.toLowerCase()
    const token = KNOWN_ALLERGEN_TOKENS.find(
      (k) => low === k || low.startsWith(k + " ")
    )
    if (token) {
      known.push(token.charAt(0).toUpperCase() + token.slice(1))
    }
  }
  if (known.length) return [...new Set(known)].join(", ")
  if (text.length <= 80 && !/cake|cream|birthday|sprinkle/i.test(text)) {
    return text
  }
  return null
}

function cleanIngredientsList(raw: string | null, title = ""): string | null {
  if (!raw) return null
  let text = raw.replace(/\s+/g, " ").trim()
  if (title) {
    const t = title.replace(/^\([^)]+\)\s*/, "").trim()
    if (t && text.toLowerCase().endsWith(t.toLowerCase())) {
      text = text.slice(0, -t.length).trim().replace(/[,\s]+$/, "")
    }
  }
  if (text.length < 3) return null
  if (isPlaceholderIngredients(text)) return null
  return text
}

function detectDietaryFromText(blob: string): string[] {
  const lower = blob.toLowerCase()
  const out = new Set<string>()

  // Cake Break brand is egg-free; also match explicit product copy.
  if (
    /egg\s*-?\s*free/.test(lower) ||
    /\beggless\b/.test(lower) ||
    /\beggfree\b/.test(lower) ||
    /without egg/.test(lower) ||
    /no eggs?\b/.test(lower)
  ) {
    out.add("Eggless")
  }

  if (/\bvegan\b/.test(lower)) {
    out.add("Vegan")
    out.add("Dairy-free")
    out.add("Eggless")
  }

  if (/dairy\s*-?\s*free/.test(lower) || /without dairy/.test(lower)) {
    out.add("Dairy-free")
  }

  if (/gluten\s*-?\s*free/.test(lower)) {
    out.add("Gluten-free")
  }

  if (/\bhalal\b/.test(lower)) {
    out.add("Halal")
  }

  if (/nut\s*-?\s*free/.test(lower) || /without nuts?/.test(lower)) {
    out.add("Nut-free")
  }

  return [...out]
}

function parseProductHtml(html: string, handle: string): ScrapedPage {
  const $ = cheerio.load(html)

  const title =
    textOf($, ".page-title .base") ||
    textOf($, "h1.page-title") ||
    $("title").first().text().split("-")[0]?.trim() ||
    ""

  const overview = textOf($, ".product.attribute.overview .value")
  const description =
    textOf($, ".product.attribute.description .value") ||
    textOf($, "#description .value") ||
    textOf($, "#product\\.info\\.description") ||
    textOf($, ".product.info.detailed .description .value")
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() || ""
  const sku = textOf($, ".product.attribute.sku .value")

  const rawAttributeMap: Record<string, string> = {}
  $(
    "#product-attribute-specs-table tr, .additional-attributes tr, table.data.table.additional-attributes tr"
  ).each((_, tr) => {
    const th = $(tr).find("th").text().replace(/\s+/g, " ").trim()
    const td = $(tr).find("td").text().replace(/\s+/g, " ").trim()
    if (th && td) rawAttributeMap[th] = td
  })

  // Explicit Magento attributes first
  let ingredients: string | null = null
  let allergens: string | null = null
  for (const [key, val] of Object.entries(rawAttributeMap)) {
    if (/ingredient/i.test(key) && val) ingredients = val
    if (/allergen/i.test(key) && val) allergens = val
  }

  const blob = [title, overview, description, metaDescription, ...Object.values(rawAttributeMap)]
    .filter(Boolean)
    .join("\n")

  ingredients =
    ingredients ||
    extractLabeledField(blob, [
      "Ingredients?",
      "Ingredient list",
      "Contains ingredients?",
    ])
  allergens =
    allergens ||
    extractLabeledField(blob, [
      "Allergens?",
      "Allergy advice",
      "Allergen information",
    ])

  // Magento sometimes stores "Allergens: Milk, Wheat, …" only in overview.
  if (!allergens && /allergens?\s*:/i.test(overview)) {
    allergens = extractLabeledField(overview, ["Allergens?"])
  }
  if (!ingredients && /ingredients?\s*:/i.test(`${overview}\n${description}`)) {
    ingredients = extractLabeledField(`${overview}\n${description}`, [
      "Ingredients?",
    ])
  }

  ingredients = cleanIngredientsList(ingredients, title)
  allergens = cleanAllergenList(allergens, title)

  // Never accept our own placeholder strings if they somehow appear on the page.
  if (ingredients && isPlaceholderIngredients(ingredients)) ingredients = null
  if (allergens && isPlaceholderAllergens(allergens)) allergens = null

  const dietaryNames = detectDietaryFromText(blob)

  // Brand default: whole range is egg-free (nav label "Egg Free Cakes", about page).
  // Only apply when the page looks like a real product (has title), not a 404.
  const is404 =
    /404 not found/i.test(title) ||
    /cms-no-route/i.test(html) ||
    !title

  if (!is404 && !dietaryNames.includes("Eggless")) {
    // Site-wide claim — accurate brand-level dietary tag for Cake Break.
    dietaryNames.push("Eggless")
  }

  return {
    handle,
    title,
    overview,
    description,
    metaDescription,
    sku,
    ingredients,
    allergens,
    dietaryNames: [...new Set(dietaryNames)],
    rawAttributeMap,
    ok: !is404,
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CakeBreakCatalogueBot/1.0; +https://eggfreecakebreak.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    timeout: 25000,
    // Magento sometimes redirects; follow them.
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  })
  return String(res.data)
}

async function scrapeCategoryHandles(
  logger: { info: (m: string) => void; warn: (m: string) => void }
): Promise<Map<string, Set<string>>> {
  /** handle → dietary tag names from category membership */
  const map = new Map<string, Set<string>>()

  for (const cat of CATEGORY_URLS) {
    let page = 1
    let pagesWithoutNew = 0
    const seenOnCategory = new Set<string>()

    while (page <= 20) {
      const url = page === 1 ? cat.url : `${cat.url}?p=${page}`
      try {
        logger.info(`  Category scrape: ${url}`)
        const html = await fetchHtml(url)
        const $ = cheerio.load(html)
        let found = 0

        // Product cards link to product URLs
        $("a.product-item-link, a.product.photo, .product-item-info a").each(
          (_, el) => {
            const href = $(el).attr("href") || ""
            if (!href.startsWith(BASE_URL)) return
            const path = href.substring(BASE_URL.length).replace(/^\/+|\/+$/g, "")
            if (!path || path.startsWith("cakes/") || path.includes("?")) return
            const handle = normalizeHandle(path)
            if (!handle || seenOnCategory.has(handle)) return
            seenOnCategory.add(handle)
            found++
            if (!map.has(handle)) map.set(handle, new Set())
            for (const t of cat.tags) map.get(handle)!.add(t)
          }
        )

        if (found === 0) {
          pagesWithoutNew++
          if (pagesWithoutNew >= 2) break
        } else {
          pagesWithoutNew = 0
        }
        page++
        await sleep(250)
      } catch (e: any) {
        logger.warn(`  Category scrape failed ${url}: ${e.message}`)
        break
      }
    }

    logger.info(
      `  Category ${cat.url} → ${seenOnCategory.size} product handle(s)`
    )
  }

  return map
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function run() {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run()
  )
  await Promise.all(runners)
  return results
}

function slugifyTag(name: string): DietarySlug | string {
  return name.toLowerCase().replace(/\s+/g, "-")
}

export default async function scrapeLiveIngredientsAllergens({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const productService = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        id: string
        title: string
        handle: string
        material?: string | null
        metadata?: Record<string, unknown> | null
        description?: string | null
      }>
    >
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

  const dryRun = process.env.SCRAPE_DRY_RUN === "1"
  const limit = process.env.SCRAPE_LIMIT
    ? parseInt(process.env.SCRAPE_LIMIT, 10)
    : undefined
  const concurrency = Math.max(
    1,
    parseInt(process.env.SCRAPE_CONCURRENCY || "3", 10) || 3
  )
  const delayMs = Math.max(
    0,
    parseInt(process.env.SCRAPE_DELAY_MS || "200", 10) || 200
  )

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Scrape live ingredients / allergens / dietary")
  logger.info(`  dryRun=${dryRun} concurrency=${concurrency}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // ── Ensure dietary tags exist ────────────────────────────────────────────
  const tagByName = new Map<string, { id: string; slug: string; name: string }>()
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
    tagByName.set(def.name, tag)
    logger.info(`  Dietary tag ready: ${tag.name} (${tag.slug})`)
  }

  // ── Category membership (vegan etc.) ─────────────────────────────────────
  logger.info("Scraping category pages for dietary membership…")
  const categoryTags = dryRun
    ? await scrapeCategoryHandles(logger)
    : await scrapeCategoryHandles(logger)

  // ── Load products ────────────────────────────────────────────────────────
  const products = await productService.listProducts(
    {},
    {
      take: limit && limit > 0 ? limit : 1000,
      select: ["id", "title", "handle", "material", "metadata", "description"],
    }
  )

  const toProcess = limit ? products.slice(0, limit) : products
  logger.info(`Products to scrape: ${toProcess.length}`)

  const stats = {
    scrapedOk: 0,
    scrapedFail: 0,
    withIngredients: 0,
    withAllergens: 0,
    clearedPlaceholderIngredients: 0,
    clearedPlaceholderAllergens: 0,
    productsUpdated: 0,
    dietaryLinksCreated: 0,
    dietaryFromCategory: 0,
  }

  // Existing product↔tag links (to avoid duplicate creates)
  const { data: existingLinks } = await query.graph({
    entity: ProductDietaryTagLink.entryPoint,
    fields: ["product_id", "dietary_tag_id"],
  })
  const linked = new Set(
    (existingLinks as Array<{ product_id?: string; dietary_tag_id?: string }>).map(
      (l) => `${l.product_id}::${l.dietary_tag_id}`
    )
  )

  await mapPool(toProcess, concurrency, async (product) => {
    const handle = normalizeHandle(product.handle || "")
    if (!handle) {
      stats.scrapedFail++
      return
    }

    const url = `${BASE_URL}/${handle}`
    let page: ScrapedPage

    try {
      if (delayMs) await sleep(delayMs)
      const html = await fetchHtml(url)
      page = parseProductHtml(html, handle)
      if (!page.ok) {
        stats.scrapedFail++
        logger.warn(`  ✗ Not a product page: ${handle}`)
        return
      }
      stats.scrapedOk++
    } catch (e: any) {
      stats.scrapedFail++
      logger.warn(`  ✗ Fetch failed ${handle}: ${e.message}`)
      return
    }

    // Merge category-derived dietary tags
    const catTags = categoryTags.get(handle)
    if (catTags?.size) {
      stats.dietaryFromCategory++
      for (const t of catTags) {
        if (!page.dietaryNames.includes(t)) page.dietaryNames.push(t)
      }
    }

    if (page.ingredients) stats.withIngredients++
    if (page.allergens) stats.withAllergens++

    const prevMeta =
      product.metadata && typeof product.metadata === "object"
        ? { ...(product.metadata as Record<string, unknown>) }
        : {}

    const nextMeta: Record<string, unknown> = { ...prevMeta }

    // ── Ingredients: only keep real scrape; clear placeholders ─────────────
    const prevIngredients =
      (typeof prevMeta.ingredients === "string" && prevMeta.ingredients) ||
      (typeof prevMeta.material === "string" && prevMeta.material) ||
      (typeof product.material === "string" && product.material) ||
      ""

    let nextMaterial: string | null | undefined = undefined

    if (page.ingredients) {
      nextMeta.ingredients = page.ingredients
      nextMeta.material = page.ingredients
      nextMaterial = page.ingredients
    } else if (
      isPlaceholderIngredients(prevIngredients) ||
      isPlaceholderIngredients(prevMeta.ingredients) ||
      isPlaceholderIngredients(prevMeta.material) ||
      isPlaceholderIngredients(product.material)
    ) {
      // Empty string deletes key under Medusa metadata merge semantics.
      nextMeta.ingredients = ""
      nextMeta.material = ""
      nextMaterial = null
      stats.clearedPlaceholderIngredients++
    }

    // ── Allergens: only keep real scrape; clear placeholders ───────────────
    if (page.allergens) {
      nextMeta.allergens = page.allergens
    } else if (
      isPlaceholderAllergens(prevMeta.allergens) ||
      prevMeta.allergens === "Gluten, Dairy"
    ) {
      nextMeta.allergens = ""
      stats.clearedPlaceholderAllergens++
    }

    // Record what we scraped for audit (not display-critical).
    nextMeta.scraped_source = BASE_URL
    nextMeta.scraped_at = new Date().toISOString()
    nextMeta.scraped_dietary = page.dietaryNames
    if (page.overview) nextMeta.scraped_overview = page.overview
    if (page.metaDescription) nextMeta.scraped_meta_description = page.metaDescription

    // Prefer live description when ours is empty/generic and theirs is richer
    // Prefer longest useful Magento copy: long description → meta → overview
    const descCandidates = [
      page.description,
      page.metaDescription,
      page.overview,
    ]
      .map((s) => (s || "").replace(/\s+/g, " ").trim())
      .filter(
        (s) =>
          s.length >= 20 &&
          !/^allergens?\s*:/i.test(s) &&
          s !== page.title &&
          s !== (page.title || "").replace(/^\([^)]+\)\s*/, "").trim()
      )
    descCandidates.sort((a, b) => b.length - a.length)
    const liveDesc = descCandidates[0] || ""
    const currentDesc = (product.description || "").trim()
    let nextDescription: string | undefined
    if (liveDesc && liveDesc.length > currentDesc.length) {
      nextDescription = liveDesc
    }

    const dirtyMeta =
      JSON.stringify(prevMeta) !== JSON.stringify(nextMeta) ||
      nextMaterial !== undefined ||
      nextDescription !== undefined

    if (dirtyMeta) {
      stats.productsUpdated++
      logger.info(
        `  ✓ ${handle} dietary=[${page.dietaryNames.join(", ")}] ` +
          `ingredients=${page.ingredients ? "YES" : "no"} allergens=${page.allergens ? "YES" : "no"}`
      )
      if (!dryRun) {
        await productService.updateProducts(product.id, {
          metadata: nextMeta,
          ...(nextMaterial !== undefined ? { material: nextMaterial } : {}),
          ...(nextDescription !== undefined
            ? { description: nextDescription }
            : {}),
        })
      }
    }

    // ── Link dietary tags ──────────────────────────────────────────────────
    for (const name of page.dietaryNames) {
      const tag = tagByName.get(name)
      if (!tag) continue
      const key = `${product.id}::${tag.id}`
      if (linked.has(key)) continue
      linked.add(key)
      stats.dietaryLinksCreated++
      if (!dryRun && !String(tag.id).startsWith("dry_")) {
        try {
          await remoteLink.create({
            [Modules.PRODUCT]: { product_id: product.id },
            dietary_tag: { dietary_tag_id: tag.id },
          })
        } catch (e: any) {
          // Duplicate link races are fine
          if (!/already|duplicate|exists/i.test(e.message || "")) {
            logger.warn(
              `  link fail ${handle} → ${name}: ${e.message}`
            )
          }
        }
      }
    }
  })

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  scrapedOk=${stats.scrapedOk} scrapedFail=${stats.scrapedFail}`)
  logger.info(
    `  pagesWithIngredients=${stats.withIngredients} pagesWithAllergens=${stats.withAllergens}`
  )
  logger.info(
    `  clearedPlaceholderIngredients=${stats.clearedPlaceholderIngredients} clearedPlaceholderAllergens=${stats.clearedPlaceholderAllergens}`
  )
  logger.info(
    `  productsUpdated=${stats.productsUpdated} dietaryLinksCreated=${stats.dietaryLinksCreated} dietaryFromCategory=${stats.dietaryFromCategory}`
  )
  logger.info(
    "  Note: Magento product pages do not currently publish per-product " +
      "ingredient/allergen lists. Only explicit fields are stored; placeholders were cleared."
  )
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
