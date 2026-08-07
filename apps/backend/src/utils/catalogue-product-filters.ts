/**
 * Server-side catalogue filters for sponge flavour + price range + price sort.
 *
 * Used by `filterStoreProductsByFranchise` so Medusa can paginate correctly
 * (`LIMIT/OFFSET` after a narrowed product ID allow-list) instead of the
 * storefront scanning hundreds of products in JS.
 *
 * Query params (stripped / rewritten before Medusa's product handler):
 *   q                           → catalogue search (see modes below)
 *   sponge | flavour | flavor  → sponge option / title match
 *   min_price | minPrice        → cheapest base GBP price ≥ N
 *   max_price | maxPrice        → cheapest base GBP price ≤ N
 *   order=variants.calculated_price… → rewritten to SQL price sort
 *     (Medusa cannot ORDER BY calculated_price — it is not a DB column and
 *      crashes with 500 / empty storefront results)
 *
 * Search modes for `q` (see classifyCatalogueSearch):
 *   - code:    single product-code token (e.g. R1, Tall91) → exact leading (CODE) in title
 *   - hybrid:  exactly one code token + free-text → exact code AND free-text tokens
 *   - free_text: name/flavour search (partial LIKE; multi-word AND then OR)
 * Product codes live in titles as "(R1) …" or "(Tall 91) …". Code equality uses
 * alphanumeric-normalised form so "Tall91" matches "(Tall 91)" but R1 ≠ R1X.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CatalogueProductFilters = {
  /** Free-text search (partial match on title / handle / description). */
  search?: string
  /** Normalised sponge handle or free-text needle, e.g. "chocolate". */
  sponge?: string
  minPrice?: number
  maxPrice?: number
  /**
   * Price sort direction. Set when the client requested a calculated_price
   * order (unsupported by Medusa ORM) — we sort IDs in SQL instead.
   */
  priceSort?: "asc" | "desc"
}

export type CatalogueFilterableRequest = MedusaRequest & {
  catalogue_filters?: CatalogueProductFilters
  /** When price-sorting, total matching products (for response count patch). */
  catalogue_total_count?: number
  /** Desired product order after Medusa fetch (price sort page). */
  catalogue_ordered_ids?: string[]
}

/** Medusa order values that try to sort by calculated price (broken). */
const PRICE_ORDER_ASC = "variants.calculated_price.calculated_amount"
const PRICE_ORDER_DESC = "-variants.calculated_price.calculated_amount"

// ---------------------------------------------------------------------------
// Sponge / flavour aliases (keep in sync with storefront FLAVOUR_OPTIONS)
// ---------------------------------------------------------------------------

const SPONGE_ALIASES: Record<string, string[]> = {
  // Prefer eggless display names; keep legacy needles for unmigrated data.
  victoria: ["eggless vanilla", "victoria", "vanilla"],
  chocolate: ["eggless chocolate", "chocolate"],
  "red-velvet": ["eggless red velvet", "red velvet", "red-velvet"],
  vanilla: ["eggless vanilla", "victoria", "vanilla"],
  "eggless-vanilla": ["eggless vanilla", "victoria", "vanilla"],
  "madagascar-vanilla": ["eggless vanilla", "victoria", "vanilla"],
  "victoria-sponge": ["eggless vanilla", "victoria", "vanilla"],
  "chocolate-sponge": ["eggless chocolate", "chocolate"],
  "eggless-chocolate": ["eggless chocolate", "chocolate"],
  "dark-truffle": ["eggless chocolate", "chocolate"],
  redvelvet: ["eggless red velvet", "red velvet"],
  "eggless-red-velvet": ["eggless red velvet", "red velvet", "red-velvet"],
}

const SPONGE_OPTION_TITLE_RE = "^(flavou?r|sponge)(\\s*[0-9]+)?$"

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

function firstQueryValue(value: unknown): string | undefined {
  if (value == null) return undefined
  if (Array.isArray(value)) {
    const v = value[0]
    return v == null ? undefined : String(v)
  }
  return String(value)
}

function parsePrice(raw: string | undefined): number | undefined {
  if (raw == null || raw === "") return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

/**
 * Normalise a sponge/flavour query value into match needles for ILIKE.
 */
export function spongeNeedlesFor(raw: string | undefined): string[] | null {
  if (!raw?.trim()) return null
  const key = raw.trim().toLowerCase().replace(/_/g, "-")
  if (SPONGE_ALIASES[key]) return SPONGE_ALIASES[key]
  // free-text: also try space form of kebab
  const spaced = key.replace(/-/g, " ")
  return spaced === key ? [key] : [key, spaced]
}

/**
 * Read catalogue filter params from the query string and attach them to
 * `req.catalogue_filters`. Removes the custom keys so Medusa's strict
 * `/store/products` zod schema does not reject the request.
 *
 * Register as a **global** middleware (no `methods`) so it runs before
 * `validateAndTransformQuery`.
 */
export const captureCatalogueQueryFilters = (
  req: CatalogueFilterableRequest,
  _res: unknown,
  next: (err?: unknown) => void
): void => {
  try {
    const q = (req.query ?? {}) as Record<string, unknown>

    const searchRaw = firstQueryValue(q.q)?.trim()

    const spongeRaw =
      firstQueryValue(q.sponge) ??
      firstQueryValue(q.flavour) ??
      firstQueryValue(q.flavor)

    const minPrice = parsePrice(
      firstQueryValue(q.min_price) ?? firstQueryValue(q.minPrice)
    )
    const maxPrice = parsePrice(
      firstQueryValue(q.max_price) ?? firstQueryValue(q.maxPrice)
    )

    // calculated_price is not a DB column — strip before Medusa orders by it.
    const orderRaw = firstQueryValue(q.order)?.trim()
    let priceSort: "asc" | "desc" | undefined
    if (orderRaw === PRICE_ORDER_ASC || orderRaw === `+${PRICE_ORDER_ASC}`) {
      priceSort = "asc"
      delete q.order
    } else if (orderRaw === PRICE_ORDER_DESC) {
      priceSort = "desc"
      delete q.order
    }

    const filters: CatalogueProductFilters = {}
    // Capture + strip Medusa `q` — we apply friendlier SQL search ourselves.
    if (searchRaw) filters.search = searchRaw
    if (spongeRaw?.trim()) filters.sponge = spongeRaw.trim()
    if (minPrice != null) filters.minPrice = minPrice
    if (maxPrice != null) filters.maxPrice = maxPrice
    if (priceSort) filters.priceSort = priceSort

    if (Object.keys(filters).length) {
      req.catalogue_filters = filters
    }

    delete q.q
    delete q.sponge
    delete q.flavour
    delete q.flavor
    delete q.min_price
    delete q.max_price
    delete q.minPrice
    delete q.maxPrice

    next()
  } catch (err) {
    next(err)
  }
}

export function getCatalogueFilters(
  req: CatalogueFilterableRequest
): CatalogueProductFilters | undefined {
  return req.catalogue_filters
}

/**
 * Ensure broken calculated_price ORDER BY never reaches MikroORM.
 * Clears order from query / validatedQuery / listConfig / remoteQueryConfig.
 * If price sort was not already captured (middleware order race), derive it now.
 */
export function neutralizeCalculatedPriceOrder(
  req: CatalogueFilterableRequest
): void {
  const readOrder = (): string | undefined => {
    const q = (req.query ?? {}) as Record<string, unknown>
    const vq = (req as { validatedQuery?: Record<string, unknown> })
      .validatedQuery
    const lc = (req as { listConfig?: { order?: unknown } }).listConfig
    const rc = (
      req as { remoteQueryConfig?: { pagination?: { order?: unknown } } }
    ).remoteQueryConfig

    return (
      firstQueryValue(q.order) ??
      firstQueryValue(vq?.order) ??
      (typeof lc?.order === "string" ? lc.order : undefined) ??
      (typeof rc?.pagination?.order === "string"
        ? rc.pagination.order
        : undefined)
    )
  }

  const orderRaw = readOrder()?.trim()
  if (!orderRaw) return

  const isPriceOrder =
    orderRaw === PRICE_ORDER_ASC ||
    orderRaw === `+${PRICE_ORDER_ASC}` ||
    orderRaw === PRICE_ORDER_DESC ||
    orderRaw.includes("calculated_price")

  if (!isPriceOrder) return

  if (!req.catalogue_filters?.priceSort) {
    req.catalogue_filters = {
      ...(req.catalogue_filters ?? {}),
      priceSort: orderRaw.startsWith("-") ? "desc" : "asc",
    }
  }

  const q = (req.query ?? {}) as Record<string, unknown>
  delete q.order

  const vq = (req as { validatedQuery?: Record<string, unknown> }).validatedQuery
  if (vq) delete vq.order

  const lc = (req as { listConfig?: { order?: unknown } }).listConfig
  if (lc) delete lc.order

  const qc = (
    req as {
      queryConfig?: { pagination?: { order?: unknown } }
      remoteQueryConfig?: { pagination?: { order?: unknown } }
    }
  ).queryConfig
  if (qc?.pagination) delete qc.pagination.order

  const rc = (
    req as { remoteQueryConfig?: { pagination?: { order?: unknown } } }
  ).remoteQueryConfig
  if (rc?.pagination) delete rc.pagination.order
}

export function hasCatalogueFilters(
  filters?: CatalogueProductFilters
): boolean {
  if (!filters) return false
  return (
    Boolean(filters.search) ||
    Boolean(filters.sponge) ||
    filters.minPrice != null ||
    filters.maxPrice != null ||
    Boolean(filters.priceSort)
  )
}

/** Tokenise a free-text query for partial matching. */
export function searchTokensFor(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .toLowerCase()
    .split(/[\s,+/|]+/)
    .map((t) => t.replace(/[^a-z0-9%._-]/gi, ""))
    .filter((t) => t.length >= 1)
}

/**
 * Product-code shape after tokenisation: letters + digits + optional trailing letters.
 * e.g. r1, r1x, x2, sq12 — not cake, 12, 8inch, r-1.
 */
const PRODUCT_CODE_TOKEN_RE = /^[a-z]+\d+[a-z]*$/

export function isProductCodeToken(token: string): boolean {
  return PRODUCT_CODE_TOKEN_RE.test(token)
}

export type CatalogueSearchClassification =
  | { mode: "code"; code: string }
  | { mode: "hybrid"; code: string; freeTextTokens: string[] }
  | { mode: "free_text"; tokens: string[] }

/**
 * Decide how `filterProductIdsBySearch` should treat tokenised query tokens.
 * - code: single code-shaped token → exact title (CODE) only
 * - hybrid: exactly one code-shaped among multiple → exact code + free-text AND
 * - free_text: zero codes, or two+ codes → partial match (legacy path)
 */
export function classifyCatalogueSearch(
  tokens: string[]
): CatalogueSearchClassification {
  if (!tokens.length) {
    return { mode: "free_text", tokens }
  }

  const codeTokens = tokens.filter(isProductCodeToken)
  const freeTextTokens = tokens.filter((t) => !isProductCodeToken(t))

  if (tokens.length === 1 && codeTokens.length === 1) {
    return { mode: "code", code: codeTokens[0] }
  }

  if (codeTokens.length === 1 && freeTextTokens.length >= 1) {
    return {
      mode: "hybrid",
      code: codeTokens[0],
      freeTextTokens,
    }
  }

  return { mode: "free_text", tokens }
}

/**
 * Leading Magento-style product code from title: "(R1) Simple Fresh Cream Cake".
 * Mid-title parentheses (e.g. servings) are ignored.
 * Returns the raw lowercased code (may contain spaces, e.g. "tall 91").
 * Use {@link normalizeProductCode} when comparing to a query token.
 */
export function productCodeFromTitle(
  title: string | null | undefined
): string | null {
  if (!title?.trim()) return null
  const m = title.trim().match(/^\(([^)]+)\)\s*/)
  if (!m?.[1]) return null
  const code = m[1].trim().toLowerCase()
  return code.length ? code : null
}

/**
 * Collapse a product code for equality checks.
 * "(Tall 91)" and query "Tall91" both become "tall91".
 * Keeps R1 ≠ R1X (letters/digits only; no fuzzy prefix match).
 */
export function normalizeProductCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "")
}

// ---------------------------------------------------------------------------
// SQL filters (knex / PG_CONNECTION)
// ---------------------------------------------------------------------------

type KnexLike = {
  raw: (
    sql: string,
    bindings?: unknown[]
  ) => Promise<{ rows?: Array<Record<string, unknown>> }> | { rows?: Array<Record<string, unknown>> }
}

function extractRows(
  result: { rows?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result
  return result.rows ?? []
}

/**
 * Products whose Sponge/Flavour option value matches any needle.
 * If a product has no sponge/flavour option, falls back to title/description
 * ILIKE (mirrors storefront `productMatchesFlavour` behaviour).
 */
export async function filterProductIdsBySponge(
  knex: KnexLike,
  productIds: string[],
  spongeRaw: string
): Promise<string[]> {
  if (!productIds.length) return []
  const needles = spongeNeedlesFor(spongeRaw)
  if (!needles?.length) return productIds

  const likePatterns = needles.map((n) => `%${n.toLowerCase()}%`)
  const valueClause = likePatterns.map(() => "LOWER(pov.value) LIKE ?").join(" OR ")
  const titleClause = likePatterns
    .map(
      () =>
        "(LOWER(COALESCE(p.title, '')) LIKE ? OR LOWER(COALESCE(p.description, '')) LIKE ?)"
    )
    .join(" OR ")

  const sql = `
    WITH candidates AS (
      SELECT UNNEST(?::text[]) AS product_id
    ),
    has_sponge AS (
      SELECT DISTINCT po.product_id
      FROM product_option po
      INNER JOIN candidates c ON c.product_id = po.product_id
      WHERE po.deleted_at IS NULL
        AND po.title ~* ?
    ),
    option_match AS (
      SELECT DISTINCT po.product_id
      FROM product_option po
      INNER JOIN candidates c ON c.product_id = po.product_id
      INNER JOIN product_option_value pov
        ON pov.option_id = po.id AND pov.deleted_at IS NULL
      WHERE po.deleted_at IS NULL
        AND po.title ~* ?
        AND (${valueClause})
    ),
    title_match AS (
      SELECT p.id AS product_id
      FROM product p
      INNER JOIN candidates c ON c.product_id = p.id
      WHERE p.deleted_at IS NULL
        AND p.id NOT IN (SELECT product_id FROM has_sponge)
        AND (${titleClause})
    )
    SELECT product_id FROM option_match
    UNION
    SELECT product_id FROM title_match
  `

  const bindings: unknown[] = [
    productIds,
    SPONGE_OPTION_TITLE_RE,
    SPONGE_OPTION_TITLE_RE,
    ...likePatterns,
    ...likePatterns.flatMap((p) => [p, p]),
  ]

  const result = await knex.raw(sql, bindings)
  const rows = extractRows(result as { rows?: Array<Record<string, unknown>> })
  return rows
    .map((r) => r.product_id as string)
    .filter((id): id is string => Boolean(id))
}

/**
 * Products whose cheapest base GBP price is within [minPrice, maxPrice].
 * Products with no base GBP price are kept (same as prior storefront behaviour).
 */
export async function filterProductIdsByPrice(
  knex: KnexLike,
  productIds: string[],
  minPrice?: number,
  maxPrice?: number,
  currencyCode = "gbp"
): Promise<string[]> {
  if (!productIds.length) return []
  if (minPrice == null && maxPrice == null) return productIds

  const wherePriced: string[] = []
  const whereBindings: unknown[] = []
  if (minPrice != null) {
    wherePriced.push("pr.min_amount >= ?")
    whereBindings.push(minPrice)
  }
  if (maxPrice != null) {
    wherePriced.push("pr.min_amount <= ?")
    whereBindings.push(maxPrice)
  }

  const sql = `
    WITH candidates AS (
      SELECT UNNEST(?::text[]) AS product_id
    ),
    priced AS (
      SELECT pv.product_id, MIN(p.amount) AS min_amount
      FROM product_variant pv
      INNER JOIN candidates c ON c.product_id = pv.product_id
      INNER JOIN product_variant_price_set pvps
        ON pvps.variant_id = pv.id AND pvps.deleted_at IS NULL
      INNER JOIN price p
        ON p.price_set_id = pvps.price_set_id
        AND p.deleted_at IS NULL
        AND p.price_list_id IS NULL
        AND p.currency_code = ?
      WHERE pv.deleted_at IS NULL
      GROUP BY pv.product_id
    )
    SELECT c.product_id
    FROM candidates c
    LEFT JOIN priced pr ON pr.product_id = c.product_id
    WHERE pr.min_amount IS NULL
       OR (${wherePriced.join(" AND ")})
  `

  const result = await knex.raw(sql, [
    productIds,
    currencyCode.toLowerCase(),
    ...whereBindings,
  ])
  const rows = extractRows(result as { rows?: Array<Record<string, unknown>> })
  return rows
    .map((r) => r.product_id as string)
    .filter((id): id is string => Boolean(id))
}

/**
 * Catalogue search over franchise/store candidate product IDs.
 *
 * Modes (classifyCatalogueSearch):
 * - code: exact leading title (CODE) — R1 does not match R1X; miss → empty
 * - hybrid: exact code, then free-text AND on remaining tokens (no OR fallback)
 * - free_text: partial LIKE on title/handle/description; multi-word AND then OR
 */
export async function filterProductIdsBySearch(
  knex: KnexLike,
  productIds: string[],
  searchRaw: string
): Promise<string[]> {
  if (!productIds.length) return []
  const tokens = searchTokensFor(searchRaw)
  if (!tokens.length) return productIds

  const classified = classifyCatalogueSearch(tokens)

  if (classified.mode === "code") {
    return filterProductIdsByExactTitleCode(knex, productIds, classified.code)
  }

  if (classified.mode === "hybrid") {
    const byCode = await filterProductIdsByExactTitleCode(
      knex,
      productIds,
      classified.code
    )
    if (!byCode.length) return []
    return filterProductIdsByFreeTextTokens(
      knex,
      byCode,
      classified.freeTextTokens,
      "and"
    )
  }

  // free_text: AND first; if multi-token AND is empty, OR fallback
  const andHits = await filterProductIdsByFreeTextTokens(
    knex,
    productIds,
    classified.tokens,
    "and"
  )
  if (andHits.length || classified.tokens.length === 1) return andHits
  return filterProductIdsByFreeTextTokens(
    knex,
    productIds,
    classified.tokens,
    "or"
  )
}

/**
 * Products whose leading title code equals `code` (case-insensitive).
 * Title pattern: "(R1) …" or "(Tall 91) …" — mid-title parentheses are not used.
 * Comparison is on {@link normalizeProductCode} so "Tall91" matches "(Tall 91)".
 */
async function filterProductIdsByExactTitleCode(
  knex: KnexLike,
  productIds: string[],
  code: string
): Promise<string[]> {
  if (!productIds.length || !code) return []

  const normalized = normalizeProductCode(code)
  if (!normalized) return []

  // Strip non-alphanumerics from the leading (CODE) so spaced Magento codes
  // like "(Tall 91)" match compact queries like "Tall91" / "tall91".
  const sql = `
    WITH candidates AS (
      SELECT UNNEST(?::text[]) AS product_id
    )
    SELECT p.id AS product_id
    FROM product p
    INNER JOIN candidates c ON c.product_id = p.id
    WHERE p.deleted_at IS NULL
      AND regexp_replace(
            LOWER(COALESCE(SUBSTRING(p.title FROM '^\\(([^)]+)\\)'), '')),
            '[^a-z0-9]',
            '',
            'g'
          ) = ?
  `

  const result = await knex.raw(sql, [productIds, normalized])
  const rows = extractRows(
    result as { rows?: Array<Record<string, unknown>> }
  )
  return rows
    .map((r) => r.product_id as string)
    .filter((id): id is string => Boolean(id))
}

/** Partial match on title / handle / description for free-text tokens. */
async function filterProductIdsByFreeTextTokens(
  knex: KnexLike,
  productIds: string[],
  tokens: string[],
  mode: "and" | "or"
): Promise<string[]> {
  if (!productIds.length) return []
  if (!tokens.length) return productIds

  const joiner = mode === "and" ? " AND " : " OR "
  const tokenClause = tokens
    .map(
      () =>
        `(
            LOWER(p.title) LIKE ?
            OR LOWER(COALESCE(p.handle, '')) LIKE ?
            OR LOWER(COALESCE(p.description, '')) LIKE ?
          )`
    )
    .join(joiner)

  const sql = `
    WITH candidates AS (
      SELECT UNNEST(?::text[]) AS product_id
    )
    SELECT p.id AS product_id
    FROM product p
    INNER JOIN candidates c ON c.product_id = p.id
    WHERE p.deleted_at IS NULL
      AND (${tokenClause})
  `

  const bindings: unknown[] = [
    productIds,
    ...tokens.flatMap((t) => {
      const like = `%${t}%`
      return [like, like, like]
    }),
  ]

  const result = await knex.raw(sql, bindings)
  const rows = extractRows(
    result as { rows?: Array<Record<string, unknown>> }
  )
  return rows
    .map((r) => r.product_id as string)
    .filter((id): id is string => Boolean(id))
}

/**
 * Sort product IDs by cheapest base GBP price.
 * Products without a price sink to the end (asc) / start (desc) consistently
 * by treating missing price as +Infinity for asc and -Infinity for desc.
 */
export async function sortProductIdsByPrice(
  knex: KnexLike,
  productIds: string[],
  direction: "asc" | "desc",
  currencyCode = "gbp"
): Promise<string[]> {
  if (!productIds.length) return []

  const dir = direction === "desc" ? "DESC" : "ASC"
  // NULLS LAST for asc (cheap first, unknown last); NULLS FIRST for desc
  // so expensive known prices lead, then unknowns.
  const nulls = direction === "desc" ? "NULLS FIRST" : "NULLS LAST"

  const sql = `
    WITH candidates AS (
      SELECT UNNEST(?::text[]) AS product_id
    ),
    priced AS (
      SELECT pv.product_id, MIN(p.amount) AS min_amount
      FROM product_variant pv
      INNER JOIN candidates c ON c.product_id = pv.product_id
      INNER JOIN product_variant_price_set pvps
        ON pvps.variant_id = pv.id AND pvps.deleted_at IS NULL
      INNER JOIN price p
        ON p.price_set_id = pvps.price_set_id
        AND p.deleted_at IS NULL
        AND p.price_list_id IS NULL
        AND p.currency_code = ?
      WHERE pv.deleted_at IS NULL
      GROUP BY pv.product_id
    )
    SELECT c.product_id
    FROM candidates c
    LEFT JOIN priced pr ON pr.product_id = c.product_id
    ORDER BY pr.min_amount ${dir} ${nulls}, c.product_id ASC
  `

  const result = await knex.raw(sql, [productIds, currencyCode.toLowerCase()])
  const rows = extractRows(result as { rows?: Array<Record<string, unknown>> })
  const ordered = rows
    .map((r) => r.product_id as string)
    .filter((id): id is string => Boolean(id))

  // Safety: if SQL returned nothing unexpected, fall back to input order
  return ordered.length ? ordered : productIds
}

function parsePagination(req: CatalogueFilterableRequest): {
  limit: number
  offset: number
} {
  const q = (req.query ?? {}) as Record<string, unknown>
  // After Medusa validation these may live on validatedQuery
  const vq = (req as { validatedQuery?: Record<string, unknown> }).validatedQuery
  const limitRaw = firstQueryValue(vq?.limit ?? q.limit)
  const offsetRaw = firstQueryValue(vq?.offset ?? q.offset)
  const limit = Math.min(Math.max(Number(limitRaw) || 24, 1), 100)
  const offset = Math.max(Number(offsetRaw) || 0, 0)
  return { limit, offset }
}

/**
 * Apply sponge + price-range filters, then optional price sort + page slice.
 *
 * When price-sorting, only the current page of IDs is returned and
 * `req.catalogue_total_count` / `req.catalogue_ordered_ids` are set so the
 * response can be patched with the correct count and order.
 */
export async function applyCatalogueProductFilters(
  req: CatalogueFilterableRequest,
  productIds: string[]
): Promise<string[]> {
  const filters = getCatalogueFilters(req)
  if (!productIds.length) return productIds

  const knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as KnexLike

  let ids = productIds

  // Drop any residual Medusa `q` so core list doesn't re-filter with its
  // stricter search after we've already narrowed IDs.
  const fields = req.filterableFields as Record<string, unknown> | undefined
  if (fields && "q" in fields) delete fields.q

  if (filters?.search) {
    ids = await filterProductIdsBySearch(knex, ids, filters.search)
    if (!ids.length) return []
  }

  if (filters?.sponge) {
    ids = await filterProductIdsBySponge(knex, ids, filters.sponge)
    if (!ids.length) return []
  }

  if (filters?.minPrice != null || filters?.maxPrice != null) {
    ids = await filterProductIdsByPrice(
      knex,
      ids,
      filters.minPrice,
      filters.maxPrice
    )
    if (!ids.length) return []
  }

  if (filters?.priceSort) {
    ids = await sortProductIdsByPrice(knex, ids, filters.priceSort)
    const { limit, offset } = parsePagination(req)
    req.catalogue_total_count = ids.length
    const pageIds = ids.slice(offset, offset + limit)
    req.catalogue_ordered_ids = pageIds
    return pageIds
  }

  return ids
}

/**
 * Patch Medusa's list response so price-sorted pages report the full
 * matching count and products appear in price order (IN (...) does not).
 */
export function patchCatalogueListResponse(
  req: CatalogueFilterableRequest,
  res: MedusaResponse,
  next: (err?: unknown) => void
): void {
  const total = req.catalogue_total_count
  const orderedIds = req.catalogue_ordered_ids

  if (total == null && !orderedIds?.length) {
    next()
    return
  }

  const originalJson = res.json.bind(res) as (
    body: unknown
  ) => MedusaResponse

  res.json = ((body: unknown) => {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const payload = body as {
        products?: Array<{ id?: string }>
        count?: number
        offset?: number
        limit?: number
      }

      if (Array.isArray(payload.products) && orderedIds?.length) {
        const byId = new Map(
          payload.products
            .filter((p) => p?.id)
            .map((p) => [p.id as string, p])
        )
        payload.products = orderedIds
          .map((id) => byId.get(id))
          .filter((p): p is { id?: string } => Boolean(p))
      }

      if (typeof total === "number") {
        payload.count = total
      }
    }
    return originalJson(body)
  }) as typeof res.json

  next()
}
