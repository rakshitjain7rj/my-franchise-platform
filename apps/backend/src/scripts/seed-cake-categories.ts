/**
 * seed-cake-categories.ts
 *
 * Creates Cake Break product categories matching eggfreecakebreak.com and
 * assigns every catalogue product into the right category buckets.
 *
 * Strategy
 * ────────
 * 1. Ensure the full category tree exists (shape + occasion groups).
 * 2. Deactivate leftover Medusa demo categories (Shirts, Merch, …).
 * 3. Scrape live category pages for handle → category membership (best source).
 * 4. Fall back to SKU/title prefix heuristics for products the scrape misses.
 *
 * Run:
 *   cd apps/backend && npx medusa exec ./src/scripts/seed-cake-categories.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import axios from "axios"
import * as cheerio from "cheerio"

// ─── Category definitions (mirror eggfreecakebreak.com) ──────────────────────

type CakeCategoryDef = {
  name: string
  handle: string
  description: string
  /** Live Magento path under /cakes/ (if different from handle). */
  livePath?: string
  /** Rank among siblings (lower = first). */
  rank: number
}

/** Primary "shop by shape / style" categories shown on the homepage. */
const FEATURED_CATEGORIES: CakeCategoryDef[] = [
  {
    name: "Round Cakes",
    handle: "round-cakes",
    description: "Classic round birthday and celebration cakes.",
    rank: 10,
  },
  {
    name: "Square Cakes",
    handle: "square-cakes",
    description: "Square cream and decorated celebration cakes.",
    rank: 20,
  },
  {
    name: "Tall Cakes",
    handle: "tall-cakes",
    description: "Extra-tall buttercream and drip cakes.",
    rank: 30,
  },
  {
    name: "Heart Cakes",
    handle: "heart-cake",
    description: "Heart-shaped cakes for romance and celebrations.",
    rank: 40,
  },
  {
    name: "Icing Cakes",
    handle: "icing-cakes",
    description: "Fondant and icing-covered designer cakes.",
    rank: 50,
  },
  {
    name: "Novelty / Kids Cakes",
    handle: "novelty-kids-cakes",
    description: "Character and themed cakes for children.",
    rank: 60,
  },
  {
    name: "Number Cakes",
    handle: "number-cakes",
    description: "Number-shaped birthday cakes.",
    rank: 70,
  },
  {
    name: "Baby Shower / Christening Cakes",
    handle: "baby-shower-cakes",
    description: "Cakes for baby showers, christenings and gender reveals.",
    rank: 80,
  },
  {
    name: "Wedding Cakes",
    handle: "wedding-cakes",
    description: "Tiered and elegant wedding cakes.",
    rank: 90,
  },
  {
    name: "Tiered Cakes",
    handle: "tiered-cakes",
    description: "Multi-tier celebration cakes.",
    rank: 100,
  },
  {
    name: "Tray Cakes",
    handle: "tray-cakes",
    description: "Large tray cakes for parties and gatherings.",
    rank: 110,
  },
  {
    name: "Doll Cakes",
    handle: "doll-cakes",
    description: "Standing doll and princess cakes.",
    rank: 120,
  },
  {
    name: "Graduation Cakes",
    handle: "graduation-cakes",
    description: "Cakes for graduations and academic milestones.",
    rank: 130,
  },
  {
    name: "Click & Collect",
    handle: "click-and-collect",
    description: "Cakes available for quick click and collect.",
    rank: 140,
  },
  {
    name: "Umrah And Hajj Mubarak Cakes",
    handle: "umrah-and-hajj-mubarak-cake",
    description: "Cakes for Umrah and Hajj celebrations.",
    rank: 150,
  },
  {
    name: "Vegan & Dairy Free Cakes",
    handle: "vegan-cakes-dairy-free",
    description: "Vegan and dairy-free cakes.",
    rank: 160,
  },
  {
    name: "Cupcakes, Slices and Extras",
    handle: "cupcakes-slices-and-extras",
    description: "Delicious cupcakes, cake slices, and extra treats.",
    rank: 170,
  },
  {
    name: "Giant Cookies",
    handle: "giant-cookies",
    description: "Decorated giant cookies for celebrations.",
    rank: 180,
  },
  {
    name: "Chocolate Bouquets",
    handle: "chocolate-bouquets",
    description: "Gift chocolate bouquets.",
    rank: 190,
  },
  {
    name: "Photo Cakes",
    handle: "photo-cake",
    description: "Custom printed edible photo cakes.",
    rank: 145,
  },
  {
    name: "Double Tall Cakes",
    handle: "double-tall-cakes",
    description: "Extra height double-tall celebration cakes.",
    rank: 35,
  },
]

/** Seasonal / occasion categories. */
const SEASONAL_CATEGORIES: CakeCategoryDef[] = [
  {
    name: "Christmas Cakes",
    handle: "christmas",
    livePath: "christmas-cakes-cupcakes",
    description: "Festive Christmas cakes and cupcakes.",
    rank: 200,
  },
  {
    name: "Diwali Cakes",
    handle: "diwali-cakes",
    description: "Diwali celebration cakes and boxes.",
    rank: 210,
  },
  {
    name: "Easter Cakes",
    handle: "easter",
    description: "Easter cakes and cupcakes.",
    rank: 220,
  },
  {
    name: "Father's Day Cakes",
    handle: "fathers-day-cakes",
    description: "Cakes for Father's Day.",
    rank: 230,
  },
  {
    name: "Lohri Cakes",
    handle: "lohri-cakes",
    description: "Lohri celebration cakes.",
    rank: 240,
  },
  {
    name: "Valentine's Day Cakes",
    handle: "valentines",
    description: "Romantic Valentine's cakes.",
    rank: 250,
  },
  {
    name: "Vaisakhi Cakes",
    handle: "vaisakhi-cakes",
    description: "Vaisakhi celebration cakes.",
    rank: 260,
  },
  {
    name: "Eid Cakes",
    handle: "eid-cakes",
    description: "Eid Mubarak cakes and cupcakes.",
    rank: 270,
  },
  {
    name: "Mother's Day Cakes",
    handle: "mothers-day-cakes",
    description: "Cakes for Mother's Day.",
    rank: 280,
  },
  {
    name: "Raksha Bandhan",
    handle: "raksha-bandhan",
    description: "Raksha Bandhan cakes and cupcakes.",
    rank: 290,
  },
]

const ALL_CATEGORIES = [...FEATURED_CATEGORIES, ...SEASONAL_CATEGORIES]

/** Demo categories left over from Medusa's initial seed — hide from storefront. */
const DEMO_CATEGORY_HANDLES = new Set([
  "shirts",
  "sweatshirts",
  "pants",
  "merch",
])

const BASE_URL = "https://eggfreecakebreak.com"
const USER_AGENT =
  "Mozilla/5.0 (compatible; CakeBreakCatalogueBot/1.0; +https://eggfreecakebreak.com)"

// ─── Prefix heuristics (SKU codes on live products) ──────────────────────────

/**
 * Maps product code prefix (from titles like "(R1) …" or handles like "…-r1")
 * to one or more category handles. Products may land in multiple categories
 * (e.g. a heart wedding cake).
 */
const PREFIX_TO_HANDLES: Record<string, string[]> = {
  r: ["round-cakes"],
  s: ["square-cakes"],
  tall: ["tall-cakes"],
  h: ["heart-cake", "valentines"],
  ic: ["icing-cakes"],
  nk: ["novelty-kids-cakes"],
  n: ["number-cakes"],
  b: ["baby-shower-cakes"],
  w: ["wedding-cakes"],
  wfc: ["wedding-cakes"],
  td: ["tiered-cakes"],
  t: ["tray-cakes"],
  d: ["doll-cakes"],
  x: ["christmas"],
  di: ["diwali-cakes"],
  lo: ["lohri-cakes"],
  rb: ["raksha-bandhan"],
  e: ["eid-cakes"],
  // Cupcakes / extras
  c: ["cupcakes-slices-and-extras"],
  ex: ["cupcakes-slices-and-extras"],
  v: ["vegan-cakes-dairy-free"], // vegan
  gc: ["giant-cookies"],
  cb: ["chocolate-bouquets"],
  um: ["umrah-and-hajj-mubarak-cake"],
  uhm: ["umrah-and-hajj-mubarak-cake"],
}

/** Title/handle keyword overrides that always add categories. */
const KEYWORD_RULES: Array<{ pattern: RegExp; handles: string[] }> = [
  { pattern: /vegan|dairy[\s-]*free/i, handles: ["vegan-cakes-dairy-free"] },
  { pattern: /cupcake/i, handles: ["cupcakes-slices-and-extras"] },
  { pattern: /cookie/i, handles: ["giant-cookies"] },
  { pattern: /bouquet/i, handles: ["chocolate-bouquets"] },
  { pattern: /photo/i, handles: ["photo-cake"] },
  { pattern: /double[\s-]*tall/i, handles: ["double-tall-cakes"] },
  { pattern: /wedding/i, handles: ["wedding-cakes"] },
  { pattern: /graduation|grad\b/i, handles: ["graduation-cakes"] },
  { pattern: /christening|baptism|communion|baby\s*shower|gender\s*reveal/i, handles: ["baby-shower-cakes"] },
  { pattern: /christmas|xmas|santa|reindeer|holly/i, handles: ["christmas"] },
  { pattern: /diwali/i, handles: ["diwali-cakes"] },
  { pattern: /\beid\b|mubarak/i, handles: ["eid-cakes"] },
  { pattern: /umrah|hajj/i, handles: ["umrah-and-hajj-mubarak-cake"] },
  { pattern: /lohri/i, handles: ["lohri-cakes"] },
  { pattern: /raksha|rakhri|rakhi/i, handles: ["raksha-bandhan"] },
  { pattern: /valentine|heart/i, handles: ["valentines", "heart-cake"] },
  { pattern: /easter/i, handles: ["easter"] },
  { pattern: /mother'?s?\s*day/i, handles: ["mothers-day-cakes"] },
  { pattern: /father'?s?\s*day|super\s*dad/i, handles: ["fathers-day-cakes"] },
  { pattern: /vaisakhi|baisakhi/i, handles: ["vaisakhi-cakes"] },
  { pattern: /doll|barbie|elsa|princess\s*doll/i, handles: ["doll-cakes"] },
  { pattern: /number[\s-]?\d|digit/i, handles: ["number-cakes"] },
  {
    pattern:
      /spiderman|batman|avengers|unicorn|dinosaur|teddy|bluey|encanto|minnie|harry\s*potter|frozen|paw\s*patrol/i,
    handles: ["novelty-kids-cakes"],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractPrefix(title: string, handle: string): string | null {
  const fromTitle = title?.match(/\(([A-Za-z]+)\d+\)/)
  if (fromTitle) return fromTitle[1].toLowerCase()

  const fromHandle = handle?.match(
    /(?:^|-)(r|s|nk|td|ic|wfc|w|x|h|n|d|t|tall|b|lo|rb|ex|v|uhm|um|di|gc|cb|c|e)\d+$/i
  )
  if (fromHandle) return fromHandle[1].toLowerCase()

  return null
}

function heuristicHandles(title: string, handle: string): string[] {
  const handles = new Set<string>()

  const prefix = extractPrefix(title, handle)
  if (prefix && PREFIX_TO_HANDLES[prefix]) {
    for (const h of PREFIX_TO_HANDLES[prefix]) handles.add(h)
  }

  const blob = `${title} ${handle}`
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(blob)) {
      for (const h of rule.handles) handles.add(h)
    }
  }

  return Array.from(handles)
}

/**
 * Pull product handles listed on a Magento category page (first page is enough
 * for mapping; we union with heuristics for the rest of the catalogue).
 */
async function scrapeCategoryHandles(
  livePath: string,
  logger: { info: (m: string) => void; warn: (m: string) => void }
): Promise<string[]> {
  const url = `${BASE_URL}/cakes/${livePath}`
  try {
    const { data: html } = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 25_000,
    })
    const $ = cheerio.load(html)
    const handles = new Set<string>()

    // Product cards typically link to /{handle}
    $("a").each((_, el) => {
      const href = $(el).attr("href")
      if (!href) return
      try {
        const u = new URL(href, BASE_URL)
        if (u.hostname !== "eggfreecakebreak.com") return
        const path = u.pathname.replace(/\/+$/, "")
        if (!path || path === "/") return
        // Skip category/static routes
        if (
          path.startsWith("/cakes") ||
          path.startsWith("/customer") ||
          path.startsWith("/checkout") ||
          path.startsWith("/catalogsearch") ||
          path.startsWith("/media") ||
          path.startsWith("/pub") ||
          path.includes(".")
        ) {
          return
        }
        const parts = path.split("/").filter(Boolean)
        if (parts.length !== 1) return
        const handle = parts[0].toLowerCase()
        if (handle.length < 3) return
        handles.add(handle)
      } catch {
        // ignore bad URLs
      }
    })

    logger.info(`  scraped /cakes/${livePath} → ${handles.size} product handles`)
    return Array.from(handles)
  } catch (err: any) {
    logger.warn(`  failed to scrape /cakes/${livePath}: ${err.message}`)
    return []
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default async function seedCakeCategories({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Cake Break Categories Seeder")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // 1. List existing categories
  const existing = await productService.listProductCategories(
    {},
    { take: 200, select: ["id", "name", "handle", "is_active", "is_internal"] }
  )
  const byHandle = new Map<string, { id: string; name: string; handle: string }>()
  for (const cat of existing) {
    byHandle.set(cat.handle, cat)
  }
  logger.info(`Found ${existing.length} existing product categories.`)

  // 2. Create / update Cake Break categories
  const categoryIdByHandle = new Map<string, string>()

  for (const def of ALL_CATEGORIES) {
    const found = byHandle.get(def.handle)
    if (found) {
      await productService.updateProductCategories(found.id, {
        name: def.name,
        description: def.description,
        is_active: true,
        is_internal: false,
        rank: def.rank,
      })
      categoryIdByHandle.set(def.handle, found.id)
      logger.info(`✓ Updated category: ${def.name} (${def.handle})`)
    } else {
      const created = await productService.createProductCategories({
        name: def.name,
        handle: def.handle,
        description: def.description,
        is_active: true,
        is_internal: false,
        rank: def.rank,
      })
      // create may return object or array depending on version
      const cat = Array.isArray(created) ? created[0] : created
      categoryIdByHandle.set(def.handle, cat.id)
      logger.info(`+ Created category: ${def.name} (${def.handle})`)
    }
  }

  // 3. Hide Medusa demo categories from the storefront
  for (const cat of existing) {
    if (DEMO_CATEGORY_HANDLES.has(cat.handle) || !categoryIdByHandle.has(cat.handle)) {
      // Only hide known demos; leave unknown custom cats alone unless they're demos
      if (!DEMO_CATEGORY_HANDLES.has(cat.handle)) continue
      await productService.updateProductCategories(cat.id, {
        is_active: false,
        is_internal: true,
      })
      logger.info(`⊘ Deactivated demo category: ${cat.name}`)
    }
  }

  // 4. Scrape live membership
  logger.info("\n📡 Scraping live category membership from eggfreecakebreak.com…")
  /** productHandle → set of category handles */
  const scrapedMap = new Map<string, Set<string>>()

  for (const def of ALL_CATEGORIES) {
    const livePath = def.livePath ?? def.handle
    const handles = await scrapeCategoryHandles(livePath, logger)
    for (const productHandle of handles) {
      if (!scrapedMap.has(productHandle)) {
        scrapedMap.set(productHandle, new Set())
      }
      scrapedMap.get(productHandle)!.add(def.handle)
    }
    // Be polite to the live store
    await new Promise((r) => setTimeout(r, 250))
  }

  logger.info(`Scraped membership for ${scrapedMap.size} product handles.`)

  // 5. Load all products and assign categories
  logger.info("\n🧁 Assigning products to categories…")
  const products = await productService.listProducts(
    {},
    { take: 1000, select: ["id", "title", "handle"] }
  )
  logger.info(`Loaded ${products.length} products.`)

  let updated = 0
  let skipped = 0
  let uncategorised = 0

  for (const product of products) {
    const handle = (product.handle || "").toLowerCase()
    const title = product.title || ""

    // Skip non-cake catalogue junk (e.g. Magento "Our Cakes" landing)
    if (handle === "cakes" || title.toLowerCase() === "our cakes") {
      skipped++
      continue
    }

    const handleSet = new Set<string>()

    // Scrape first (most accurate for products that exist on live site)
    const scraped = scrapedMap.get(handle)
    if (scraped) {
      for (const h of scraped) handleSet.add(h)
    }

    // Heuristics always run so local-only / renamed products still get buckets
    for (const h of heuristicHandles(title, handle)) {
      handleSet.add(h)
    }

    const categoryIds = Array.from(handleSet)
      .map((h) => categoryIdByHandle.get(h))
      .filter((id): id is string => Boolean(id))

    if (!categoryIds.length) {
      uncategorised++
      // Still clear any stale demo category links
      try {
        await productService.updateProducts(product.id, { category_ids: [] })
      } catch {
        // ignore
      }
      continue
    }

    try {
      await productService.updateProducts(product.id, {
        category_ids: categoryIds,
      })
      updated++
    } catch (err: any) {
      logger.warn(
        `  failed to update ${handle}: ${err?.message ?? String(err)}`
      )
    }
  }

  logger.info("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  Categories ready: ${categoryIdByHandle.size}`)
  logger.info(`  Products updated: ${updated}`)
  logger.info(`  Skipped (non-cake): ${skipped}`)
  logger.info(`  Uncategorised:      ${uncategorised}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
