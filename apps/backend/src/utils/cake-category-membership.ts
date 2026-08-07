/**
 * Pure helpers for Cake Break product → category membership.
 *
 * Used by seed-cake-categories (assign) and import scripts.
 * Magento scrape is paginated + grid-only to mirror eggfreecakebreak.com
 * without reintroducing featured-product pollution.
 */

import axios from "axios"
import * as cheerio from "cheerio"

export const MAGENTO_BASE_URL = "https://eggfreecakebreak.com"
export const MAGENTO_USER_AGENT =
  "Mozilla/5.0 (compatible; CakeBreakCatalogueBot/1.0; +https://eggfreecakebreak.com)"

// ─── Prefix heuristics ───────────────────────────────────────────────────────

/**
 * Maps product code prefix (from titles like "(R1) …" or handles like "…-r1")
 * to one or more category handles.
 */
export const PREFIX_TO_HANDLES: Record<string, string[]> = {
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
  c: ["cupcakes-slices-and-extras"],
  ex: ["cupcakes-slices-and-extras"],
  v: ["vegan-cakes-dairy-free"],
  gc: ["giant-cookies"],
  cb: ["chocolate-bouquets"],
  um: ["umrah-and-hajj-mubarak-cake"],
  uhm: ["umrah-and-hajj-mubarak-cake"],
  dh: ["novelty-kids-cakes"],
  dt: ["novelty-kids-cakes"],
}

export const KEYWORD_RULES: Array<{ pattern: RegExp; handles: string[] }> = [
  { pattern: /vegan|dairy[\s-]*free/i, handles: ["vegan-cakes-dairy-free"] },
  { pattern: /cup\s*cakes?/i, handles: ["cupcakes-slices-and-extras"] },
  { pattern: /cookie/i, handles: ["giant-cookies"] },
  { pattern: /bouquet/i, handles: ["chocolate-bouquets"] },
  { pattern: /photo/i, handles: ["photo-cake"] },
  { pattern: /double[\s-]*tall/i, handles: ["double-tall-cakes"] },
  { pattern: /double[\s-]*high/i, handles: ["double-tall-cakes"] },
  { pattern: /\btall\b/i, handles: ["tall-cakes"] },
  { pattern: /\bicing\b|fondant/i, handles: ["icing-cakes"] },
  { pattern: /wedding/i, handles: ["wedding-cakes"] },
  { pattern: /graduation|grad\b/i, handles: ["graduation-cakes"] },
  {
    pattern: /christening|baptism|communion|baby\s*shower|gender\s*reveal/i,
    handles: ["baby-shower-cakes"],
  },
  { pattern: /christmas|xmas|santa|reindeer|holly/i, handles: ["christmas"] },
  { pattern: /diwali/i, handles: ["diwali-cakes"] },
  { pattern: /\beid\b|mubarak/i, handles: ["eid-cakes"] },
  { pattern: /umrah|hajj|\buhm\b|\bum\b/i, handles: ["umrah-and-hajj-mubarak-cake"] },
  { pattern: /lohri/i, handles: ["lohri-cakes"] },
  { pattern: /raksha|rakhri|rakhi/i, handles: ["raksha-bandhan"] },
  { pattern: /valentine|heart/i, handles: ["valentines", "heart-cake"] },
  { pattern: /easter/i, handles: ["easter"] },
  { pattern: /mother'?s?\s*day/i, handles: ["mothers-day-cakes"] },
  { pattern: /father'?s?\s*day|super\s*dad/i, handles: ["fathers-day-cakes"] },
  { pattern: /vaisakhi|baisakhi/i, handles: ["vaisakhi-cakes"] },
  { pattern: /doll|barbie|elsa|princess\s*doll/i, handles: ["doll-cakes"] },
  { pattern: /number[\s-]?\d|digit/i, handles: ["number-cakes"] },
  { pattern: /\btier(ed)?\b|\b2\s*tier\b/i, handles: ["tiered-cakes"] },
  {
    pattern:
      /spiderman|batman|avengers?|unicorn|dinosaur|teddy|bluey|encanto|minnie|harry\s*potter|frozen|paw\s*patrol|lilo|stitch|masha|lego|deadpool|wolverine|astronaut|rolex|train\s*cake|k-?pop|boss\s*baby|jungle|lion|omar\s*&\s*hana|friends\s*cake|rainbow\s*birthday|versace|character\s*themed|cocomelon|mickey/i,
    handles: ["novelty-kids-cakes"],
  },
]

const PREFIX_TOKEN =
  "tall|uhm|wfc|nk|td|ic|ex|gc|cb|di|lo|rb|um|dh|dt|r|s|h|n|b|w|x|t|d|v|c|e"

/** Per-product extras (client overrides) keyed by product handle. */
export const HANDLE_EXTRA_CATEGORIES: Record<string, string[]> = {
  "dh35-pink-white-buttercream-cake": ["round-cakes"],
}

/**
 * Extract catalogue SKU prefix from title/handle.
 */
export function extractPrefix(title: string, handle: string): string | null {
  const fromTitle = title?.match(
    new RegExp(`\\(\\s*(${PREFIX_TOKEN})[\\s\\-]*(\\d+)\\s*\\)`, "i")
  )
  if (fromTitle) return fromTitle[1].toLowerCase()

  const fromHandleLead = handle?.match(
    new RegExp(`^(${PREFIX_TOKEN})[\\-]?(\\d+)`, "i")
  )
  if (fromHandleLead) return fromHandleLead[1].toLowerCase()

  const fromHandleTail = handle?.match(
    new RegExp(`(?:^|-)(${PREFIX_TOKEN})(\\d+)$`, "i")
  )
  if (fromHandleTail) return fromHandleTail[1].toLowerCase()

  return null
}

export function heuristicHandles(title: string, handle: string): string[] {
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

  if (/double[\s-]*(tall|high)/i.test(blob)) {
    handles.delete("tall-cakes")
  }

  const extras = HANDLE_EXTRA_CATEGORIES[(handle || "").toLowerCase()]
  if (extras) {
    for (const h of extras) handles.add(h)
  }

  return Array.from(handles)
}

/**
 * Resolve category handles for one product.
 * Default: heuristics. Magento scrape handles are optional and unioned when provided.
 */
export function resolveProductCategoryHandles(
  title: string,
  handle: string,
  scrapedHandles?: Iterable<string> | null
): string[] {
  const handleSet = new Set<string>()

  for (const h of heuristicHandles(title, handle)) {
    handleSet.add(h)
  }

  if (scrapedHandles) {
    for (const h of scrapedHandles) {
      if (h) handleSet.add(h)
    }
  }

  return Array.from(handleSet)
}

// ─── Magento scrape (paginated, grid-only) ───────────────────────────────────

export type ScrapeCategoryResult = {
  livePath: string
  categoryHandle: string
  toolbarTotal: number | null
  pages: number
  handles: string[]
}

export type LoggerLike = {
  info: (m: string) => void
  warn: (m: string) => void
}

/**
 * Scrape all product handles for one Magento category (all pages).
 * Only product-grid anchors — never full-page links (avoids featured pollution).
 */
export async function scrapeCategoryHandlesPaginated(
  categoryHandle: string,
  livePath: string,
  logger: LoggerLike,
  options?: {
    baseUrl?: string
    maxPages?: number
    delayMs?: number
    productListLimit?: number
  }
): Promise<ScrapeCategoryResult> {
  const baseUrl = options?.baseUrl ?? MAGENTO_BASE_URL
  const maxPages = options?.maxPages ?? 50
  const delayMs = options?.delayMs ?? 150
  const limit = options?.productListLimit ?? 36

  let currentUrl: string | null =
    `${baseUrl}/cakes/${livePath}?product_list_limit=${limit}`
  let pages = 0
  let toolbarTotal: number | null = null
  const handleSet = new Set<string>()

  const selectors = [
    ".products-grid a.product-item-link",
    ".products.wrapper a.product-item-link",
    "ol.products.list a.product-item-link",
    "li.product-item a.product-item-link",
    ".product-item-info a.product-item-link",
  ]

  while (currentUrl && pages < maxPages) {
    try {
      const { data: html } = await axios.get(currentUrl, {
        headers: { "User-Agent": MAGENTO_USER_AGENT },
        timeout: 25_000,
      })
      const $ = cheerio.load(html)
      pages++

      if (toolbarTotal == null) {
        const nums = $(".toolbar-amount .toolbar-number")
          .map((_, el) => $(el).text().trim())
          .get()
        if (nums.length >= 3) {
          const n = parseInt(nums[2], 10)
          if (!Number.isNaN(n)) toolbarTotal = n
        }
      }

      const $links = $(selectors.join(", "))
      const nodes = $links.length ? $links : $("a.product-item-link")

      nodes.each((_, el) => {
        const href = $(el).attr("href")
        if (!href) return
        try {
          const u = new URL(href, baseUrl)
          if (!u.hostname.includes("eggfreecakebreak.com")) return
          const path = u.pathname.replace(/\/+$/, "")
          if (!path || path === "/") return
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
          const h = parts[0].toLowerCase()
          if (h.length < 3) return
          handleSet.add(h)
        } catch {
          // ignore bad URLs
        }
      })

      const next = $("a.action.next").first().attr("href")
      currentUrl = next ? next.trim() : null
      if (currentUrl && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
    } catch (err: any) {
      logger.warn(
        `  failed to scrape /cakes/${livePath} page ${pages + 1}: ${err.message}`
      )
      break
    }
  }

  const handles = Array.from(handleSet)
  logger.info(
    `  scraped /cakes/${livePath} → ${handles.length} unique handles` +
      (toolbarTotal != null ? ` (toolbar ${toolbarTotal})` : "") +
      ` over ${pages} page(s)`
  )

  return {
    livePath,
    categoryHandle,
    toolbarTotal,
    pages,
    handles,
  }
}

/**
 * Build productHandle → Set of category handles from per-category scrape results.
 */
export function invertCategoryMembership(
  byCategory: Record<string, string[]>
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const [catHandle, productHandles] of Object.entries(byCategory)) {
    for (const ph of productHandles) {
      const key = ph.toLowerCase()
      if (!map.has(key)) map.set(key, new Set())
      map.get(key)!.add(catHandle)
    }
  }
  return map
}

/**
 * Find product handles that appear in almost every Magento category page.
 * Magento templates often inject the same "featured / new" product-item links
 * into every category grid; those are not real multi-list memberships.
 */
export function findGlobalFeaturedHandles(
  byCategory: Record<string, string[]>,
  options?: {
    categoryFraction?: number
    minCategories?: number
  }
): string[] {
  const categoryFraction = options?.categoryFraction ?? 0.8
  const minCategories = options?.minCategories ?? 10

  const catEntries = Object.entries(byCategory).filter(([, hs]) => hs.length > 0)
  const nCats = catEntries.length
  if (nCats < minCategories) return []

  const threshold = Math.ceil(nCats * categoryFraction)
  const countByHandle = new Map<string, number>()

  for (const [, handles] of catEntries) {
    const uniq = new Set(handles.map((h) => h.toLowerCase()))
    for (const h of uniq) {
      countByHandle.set(h, (countByHandle.get(h) || 0) + 1)
    }
  }

  return [...countByHandle.entries()]
    .filter(([, c]) => c >= threshold)
    .map(([h]) => h)
    .sort()
}

/**
 * Remove globally-featured handles from every category list.
 * They still receive categories via SKU/title heuristics on assign.
 */
export function stripGlobalFeaturedHandles(
  byCategory: Record<string, string[]>,
  options?: {
    categoryFraction?: number
    minCategories?: number
  }
): { cleaned: Record<string, string[]>; stripped: string[] } {
  const stripped = findGlobalFeaturedHandles(byCategory, options)
  if (!stripped.length) {
    return { cleaned: { ...byCategory }, stripped: [] }
  }
  const stripSet = new Set(stripped)
  const cleaned: Record<string, string[]> = {}
  for (const [cat, handles] of Object.entries(byCategory)) {
    cleaned[cat] = handles.filter((h) => !stripSet.has(h.toLowerCase()))
  }
  return { cleaned, stripped }
}

/**
 * Detect residual pollution after stripping featured globals.
 * Returns null if OK, or a human-readable reason to abort apply.
 */
export function detectMembershipPollution(
  byCategory: Record<string, string[]>,
  options?: {
    /** Fraction of categories a handle must appear in to be "global" (default 0.8). */
    categoryFraction?: number
    /** Min categories before check runs (default 10). */
    minCategories?: number
    /** If this many global handles remain, flag pollution (default 5). */
    minGlobalHandles?: number
  }
): string | null {
  const minGlobalHandles = options?.minGlobalHandles ?? 5
  const globalHandles = findGlobalFeaturedHandles(byCategory, options)

  if (globalHandles.length >= minGlobalHandles) {
    const nCats = Object.keys(byCategory).filter(
      (k) => (byCategory[k] || []).length > 0
    ).length
    const threshold = Math.ceil(
      nCats * (options?.categoryFraction ?? 0.8)
    )
    return (
      `Pollution suspected: ${globalHandles.length} product handles appear in ` +
      `≥${threshold}/${nCats} categories (e.g. ${globalHandles.slice(0, 8).join(", ")}). ` +
      `Aborting apply — scrape may be pulling featured/footer cakes.`
    )
  }

  return null
}

export type AssignmentDiff = {
  handle: string
  title: string
  current: string[]
  proposed: string[]
  added: string[]
  removed: string[]
}

export function diffCategorySets(
  current: string[],
  proposed: string[]
): { added: string[]; removed: string[] } {
  const cur = new Set(current)
  const prop = new Set(proposed)
  const added = [...prop].filter((h) => !cur.has(h)).sort()
  const removed = [...cur].filter((h) => !prop.has(h)).sort()
  return { added, removed }
}

export type CategoryCountRow = {
  categoryHandle: string
  magentoCount: number | null
  currentCount: number
  proposedCount: number
  delta: number
}

export function buildCategoryCountReport(
  categoryHandles: string[],
  magentoByCategory: Record<string, string[]>,
  products: Array<{ handle: string; current: string[]; proposed: string[] }>
): CategoryCountRow[] {
  return categoryHandles.map((ch) => {
    const magentoCount = magentoByCategory[ch]
      ? magentoByCategory[ch].length
      : null
    const currentCount = products.filter((p) => p.current.includes(ch)).length
    const proposedCount = products.filter((p) => p.proposed.includes(ch)).length
    return {
      categoryHandle: ch,
      magentoCount,
      currentCount,
      proposedCount,
      delta: proposedCount - currentCount,
    }
  })
}

/**
 * Of Magento handles that exist in our product set, what fraction are proposed
 * for that category?
 */
export function magentoCoverageRatio(
  magentoHandles: string[],
  medusaHandles: Set<string>,
  proposedByProduct: Map<string, string[]>,
  categoryHandle: string
): { matched: number; eligible: number; ratio: number } {
  const eligible = magentoHandles.filter((h) =>
    medusaHandles.has(h.toLowerCase())
  )
  let matched = 0
  for (const h of eligible) {
    const prop = proposedByProduct.get(h.toLowerCase()) || []
    if (prop.includes(categoryHandle)) matched++
  }
  const ratio = eligible.length ? matched / eligible.length : 1
  return { matched, eligible: eligible.length, ratio }
}
