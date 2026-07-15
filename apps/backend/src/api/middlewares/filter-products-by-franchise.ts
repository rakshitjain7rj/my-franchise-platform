/**
 * @file filter-products-by-franchise.ts
 * @description Tenant-scoping middleware for Medusa's native `/store/products`
 *              and `/admin/products` routes.
 *
 * ## Security Model
 *
 * Every product in the catalogue is linked to one or more franchises through
 * the `franchise-product` DML link (see `src/links/franchise-product.ts`):
 *
 *   franchise_id ──[franchise-product link]──▶ product_id(s)
 *
 * For **store** routes the franchise context comes from the `x-franchise-id`
 * request header injected by the Next.js storefront middleware.
 *
 * For **admin** routes the franchise context is derived from the authenticated
 * user's linked franchise(s) via the `franchise-user` link table (see
 * `resolveAdminFranchiseContext` in `utils/tenant-context.ts`).
 *
 * ## Pagination Correctness
 *
 * The filter is injected into `req.filterableFields.id` BEFORE Medusa's core
 * product list handler executes. This means Medusa applies `limit` / `offset`
 * AFTER the tenant allow-list has been pushed down into the SQL WHERE clause:
 *
 *   SELECT … FROM product WHERE id IN (<franchise_product_ids>)
 *   ORDER BY … LIMIT <limit> OFFSET <offset>
 *
 * This is correct-by-construction: a `limit: 10` request returns up to 10
 * products that belong to THIS franchise — it never pulls 10 global products
 * and filters afterwards.
 *
 * ## Intersection with Client-Supplied `id` Filters
 *
 * If the storefront sends an explicit `?id[]=prod_01…` query parameter (e.g.
 * for a product detail page hit), `loadFranchiseProductIds` intersects that
 * filter with the franchise allow-list before applying it.  A client can
 * therefore never escape the tenant boundary by crafting a specific product ID.
 */

import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import FranchiseProductLink from "../../links/franchise-product"
import StoreLocationProductLink from "../../links/store-location-product"
import {
  resolveAdminFranchiseIds,
  type AuthenticatedTenantRequest,
} from "../../utils/tenant-context"
import {
  applyCatalogueProductFilters,
  neutralizeCalculatedPriceOrder,
  patchCatalogueListResponse,
  type CatalogueFilterableRequest,
} from "../../utils/catalogue-product-filters"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRANCHISE_HEADER = "x-franchise-id"
const STORE_LOCATION_HEADER = "x-store-location-id"

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a potentially multi-value header to a single trimmed string.
 */
const getHeaderValue = (value: string | string[] | undefined): string | undefined => {
  const v = Array.isArray(value) ? value[0] : value
  return v?.trim()
}

/**
 * Extract any existing `id` filter the client already placed on the request.
 * This covers both `?id[]=…` query-string filters (parsed into
 * `req.filterableFields`) and route-param `/:id` patterns.
 */
const getExistingProductIdFilter = (req: MedusaRequest): string[] | undefined => {
  const fields = req.filterableFields as Record<string, unknown> | undefined
  const idFilter = fields?.id ?? req.params?.id

  if (!idFilter) return undefined
  return Array.isArray(idFilter) ? idFilter : [idFilter as string]
}

/**
 * Mutate `req.filterableFields` to restrict the Medusa product query to an
 * explicit allow-list of product IDs.
 *
 * Medusa's built-in list-products handler reads this object when building the
 * underlying SQL query, so injecting here is the idiomatic v2 approach.
 */
const applyProductIdFilter = (req: MedusaRequest, productIds: string[]): void => {
  req.filterableFields = {
    ...(req.filterableFields ?? {}),
    id: productIds,
  }
}

/**
 * Client-supplied product filters that we forward into the franchise scoping
 * query. Forwarding these means a `?handle=x` or `?category_id=y` request is
 * resolved against a handful of candidate rows instead of triggering a scan of
 * the entire catalogue. All keys are native product-module list filters, so
 * they are safe to pass straight into `query.graph({ entity: "product" })`.
 */
// NOTE: `q` is intentionally omitted. Medusa's product-module / query.graph
// text search is unreliable for partial catalogue exploration and often
// returns an empty candidate set → 0 cakes. Free-text search is applied via
// SQL ILIKE in `catalogue-product-filters.ts` instead.
const FORWARDABLE_PRODUCT_FILTER_KEYS = [
  "handle",
  "category_id",
  "collection_id",
  "type_id",
  "tag_id",
] as const

/**
 * Pull the subset of the client's `filterableFields` that narrows the product
 * set, so we can resolve the candidate set before checking franchise ownership.
 */
const getForwardableProductFilters = (
  req: MedusaRequest
): Record<string, unknown> => {
  const fields = (req.filterableFields ?? {}) as Record<string, unknown>
  const forwarded: Record<string, unknown> = {}
  for (const key of FORWARDABLE_PRODUCT_FILTER_KEYS) {
    if (fields[key] !== undefined) forwarded[key] = fields[key]
  }
  return forwarded
}

/**
 * Resolve the candidate product IDs the client's own filters narrow to.
 *
 * Returns `null` when the request carries NO narrowing filter (the caller then
 * lists the franchise's full catalogue straight from the link table, with no
 * product scan at all). Otherwise returns the (possibly empty) candidate list,
 * already intersected with any client-supplied `id` filter so a client can
 * never escape the tenant boundary.
 */
const resolveCandidateProductIds = async (
  req: MedusaRequest
): Promise<string[] | null> => {
  const existingProductIds = getExistingProductIdFilter(req)
  const clientFilters = getForwardableProductFilters(req)
  const hasNarrowingFilter =
    Boolean(existingProductIds?.length) || Object.keys(clientFilters).length > 0

  if (!hasNarrowingFilter) return null

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: {
      ...clientFilters,
      ...(existingProductIds?.length ? { id: existingProductIds } : {}),
    },
  })

  return data
    .map((p: { id?: string }) => p.id)
    .filter((id): id is string => Boolean(id))
}

/**
 * Resolve the set of product IDs that belong to ANY of `franchiseIds`, scoped by
 * any filters the client already supplied.
 *
 * The `franchise-product` link table is the single source of truth — the former
 * `metadata.franchise_ids` fallback has been retired (see
 * `backfill-franchise-product-links.ts`), so membership is one indexed query:
 *
 *  - **No narrowing filter** → `product_id WHERE franchise_id IN (…)`. A whole-
 *    catalogue browse is a single indexed link query; the product table is never
 *    scanned.
 *  - **Narrowing filter** (`handle`, `category_id`, explicit `id`, …) → resolve
 *    the small candidate set first, then intersect it against the link table.
 *
 * One helper serves both the store path (a single franchise) and the admin path
 * (a multi-franchise user), so neither ever scans the product table.
 *
 * @returns An array of product IDs (may be empty, which the caller turns into an
 *          empty list).
 */
const loadProductIdsForFranchises = async (
  req: MedusaRequest,
  franchiseIds: string[]
): Promise<string[]> => {
  if (!franchiseIds.length) return []

  const candidateIds = await resolveCandidateProductIds(req)
  // A narrowing filter that matched nothing → no products can be allowed.
  if (candidateIds !== null && !candidateIds.length) return []

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: linkData } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: {
      // A single id collapses to a scalar so simple store queries stay readable.
      franchise_id: franchiseIds.length === 1 ? franchiseIds[0] : franchiseIds,
      ...(candidateIds !== null ? { product_id: candidateIds } : {}),
    },
  })

  return Array.from(
    new Set(
      linkData
        .map((link: { product_id?: string }) => link.product_id)
        .filter((id): id is string => Boolean(id))
    )
  )
}

/**
 * Convenience wrapper for the single-franchise (store) path.
 */
const loadFranchiseProductIds = (
  req: MedusaRequest,
  franchiseId: string
): Promise<string[]> => loadProductIdsForFranchises(req, [franchiseId])

/**
 * Resolve the store-location context for a storefront product request, if any.
 * Sourced from the `x-store-location-id` header (preferred, injected by the
 * storefront middleware) or a `store_location_id` query param. Returns undefined
 * when the request carries no store context, in which case per-store
 * availability filtering is skipped and every franchise product is shown (the
 * "shared by default" contract).
 */
const getStoreLocationContext = (req: MedusaRequest): string | undefined => {
  const headerValue = getHeaderValue(
    req.headers?.[STORE_LOCATION_HEADER] as string | string[] | undefined
  )
  if (headerValue) return headerValue

  const queryValue = (req.query as Record<string, unknown> | undefined)
    ?.store_location_id
  return typeof queryValue === "string" ? queryValue.trim() || undefined : undefined
}

/**
 * Apply per-store availability overrides to a franchise's product allow-list.
 *
 * Contract (see src/links/store-location-product.ts):
 *   - A product with NO rows in the store_location_product link is available at
 *     every store (shared) → always kept.
 *   - A product WITH rows is restricted to exactly those stores → kept only if a
 *     row names the current store location.
 *
 * Implemented as a single indexed link query over the candidate product set, so
 * it never scans the product table.
 */
const filterProductsByStoreAvailability = async (
  req: MedusaRequest,
  productIds: string[],
  storeLocationId: string | undefined
): Promise<string[]> => {
  if (!productIds.length) return productIds

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: rows } = await query.graph({
    entity: StoreLocationProductLink.entryPoint,
    fields: ["product_id", "store_location_id"],
    filters: { product_id: productIds },
  })

  // No restriction rows touch this candidate set → all shared, nothing to hide.
  if (!rows.length) return productIds

  const restrictedProductIds = new Set<string>()
  const availableAtThisStore = new Set<string>()
  for (const row of rows as Array<{
    product_id?: string
    store_location_id?: string
  }>) {
    if (!row.product_id) continue
    restrictedProductIds.add(row.product_id)
    if (storeLocationId && row.store_location_id === storeLocationId) {
      availableAtThisStore.add(row.product_id)
    }
  }

  return productIds.filter(
    (id) =>
      !restrictedProductIds.has(id) ||
      (Boolean(storeLocationId) && availableAtThisStore.has(id))
  )
}

/**
 * Resolve the franchise IDs an authenticated admin is scoped to, distinguishing
 * two very different "no franchise" situations:
 *
 *  - **Genuine super-admin** — the user has no franchise membership.
 *    `resolveAdminFranchiseIds` signals this by throwing a `NOT_ALLOWED`
 *    MedusaError. We translate that into an empty array, which callers treat as
 *    "unrestricted super-admin access".
 *
 *  - **Transient/unexpected failure** — a DB error, timeout, or any other fault
 *    inside the resolution query. These MUST NOT be swallowed: doing so would
 *    silently escalate a franchise admin to global catalogue access on any
 *    infrastructure blip. We re-throw so the request fails closed.
 */
const resolveAdminFranchiseScope = async (
  req: AuthenticatedTenantRequest
): Promise<string[]> => {
  try {
    return await resolveAdminFranchiseIds(req)
  } catch (err) {
    if (
      err instanceof MedusaError &&
      err.type === MedusaError.Types.NOT_ALLOWED
    ) {
      // Benign: genuinely no franchise membership → super-admin path.
      return []
    }
    // Unexpected failure → fail closed rather than fall through to super-admin.
    throw err
  }
}

/**
 * Guard: throw if `req.filterableFields` is not yet initialised.
 *
 * Medusa's `validateAndTransformQuery` middleware populates this object before
 * our middleware runs.  If it is missing, the registration order in
 * `middlewares.ts` is wrong.
 */
const assertFilterableFieldsReady = (req: MedusaRequest): void => {
  if (req.filterableFields) return

  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "Franchise product filter must run after Medusa's query-validation middleware. " +
      "Check the middleware registration order in src/api/middlewares.ts."
  )
}

// ---------------------------------------------------------------------------
// Middleware #1 — Store product list / detail  (GET /store/products[/:id])
// ---------------------------------------------------------------------------

/**
 * `filterStoreProductsByFranchise`
 *
 * Intercepts `GET /store/products` and `GET /store/products/:id` requests.
 *
 * Expects `req.franchise_id` to have been populated by the upstream
 * `franchiseTenantMiddleware` (registered on `/store/*`).  If the header was
 * missing, that middleware already returned a 400, so this handler only runs
 * when a valid franchise ID is present.
 *
 * After this middleware the request's `filterableFields.id` is set to the
 * franchise's product allow-list.  Medusa's core handler will then execute:
 *
 *   SELECT … FROM product
 *   WHERE id IN (<allow-list>)      ← tenant boundary
 *   LIMIT <limit> OFFSET <offset>   ← client pagination, applied AFTER filter
 *
 * ## Single-product guard (`GET /store/products/:id`)
 *
 * When `req.params.id` is present the route is a detail request.  After
 * resolving the franchise allow-list we explicitly verify that the requested
 * product ID is in that list.  If it is not, we immediately throw a
 * `MedusaError.Types.NOT_FOUND` (→ HTTP 404) so that:
 *
 *  - Cross-tenant product detail scraping returns a clean 404 (not a data
 *    leak or an ambiguous 400/500).
 *  - The behaviour is deterministic and not an accidental side-effect of
 *    Medusa's core handler receiving an empty `id` filter.
 */
export const filterStoreProductsByFranchise = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const franchiseId = req.franchise_id

    // Defensive: if no franchise_id is set and this is a store path, reject.
    if (!franchiseId) {
      res.status(400).json({
        message: "Missing required header: x-franchise-id",
        code: "MISSING_FRANCHISE_ID",
      })
      return
    }

    assertFilterableFieldsReady(req)

    // Drop unsupported calculated_price ORDER BY before the product list runs
    // (otherwise MikroORM throws and the storefront shows 0 cakes).
    neutralizeCalculatedPriceOrder(req as CatalogueFilterableRequest)

    const franchiseProductIds = await loadFranchiseProductIds(req, franchiseId)

    // Tier-2: apply per-store availability overrides. When a store context is present,
    // we keep products that are shared or explicitly assigned to that store.
    // Absent a store context, we hide all store-restricted products (customers only
    // see shared/franchise-wide products).
    const storeLocationId = getStoreLocationContext(req)
    let productIds = await filterProductsByStoreAvailability(
      req,
      franchiseProductIds,
      storeLocationId
    )

    // -----------------------------------------------------------------------
    // Catalogue filters (sponge + price range + price sort) — list only.
    // Params captured by captureCatalogueQueryFilters (global middleware).
    // -----------------------------------------------------------------------
    const catalogueReq = req as CatalogueFilterableRequest
    const requestedProductId = req.params?.id
    if (!requestedProductId) {
      productIds = await applyCatalogueProductFilters(catalogueReq, productIds)
    }

    // -----------------------------------------------------------------------
    // Single-product guard: GET /store/products/:id
    // -----------------------------------------------------------------------
    // When the route contains a path parameter (e.g. /store/products/prod_01…)
    // we must confirm the requested product belongs to this franchise AND is
    // available at the requested store location (if any).
    // Relying on an empty filterableFields.id causing a downstream 404 is
    // fragile; an explicit check is the safe, intent-clear approach.
    if (requestedProductId) {
      if (!productIds.includes(requestedProductId)) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "Product not found"
        )
      }
    } else if (!productIds.length) {
      // CRITICAL: Medusa ignores an empty `id: []` filter and would return the
      // entire global catalogue. Empty allow-list → short-circuit.
      // Price-sort may have a non-zero total with an empty page (past last page).
      const total = catalogueReq.catalogue_total_count ?? 0
      const q = (req.query ?? {}) as Record<string, unknown>
      res.status(200).json({
        products: [],
        count: total,
        offset: Number(q.offset) || 0,
        limit: Number(q.limit) || 0,
      })
      return
    }

    applyProductIdFilter(req, productIds)

    // Price sort: Medusa cannot ORDER BY calculated_price; we sliced IDs in SQL
    // and must patch count + product order on the way out.
    if (catalogueReq.catalogue_total_count != null) {
      patchCatalogueListResponse(catalogueReq, res, next)
      return
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}

// ---------------------------------------------------------------------------
// Middleware #2 — Admin product list / detail  (GET /admin/products[/:id])
// ---------------------------------------------------------------------------

/**
 * `filterAdminProductsByFranchise`
 *
 * Intercepts `GET /admin/products` and `GET /admin/products/:id` requests.
 *
 * Unlike the store variant, the franchise context here comes from the
 * authenticated user's franchise membership (not a client-supplied header),
 * preventing privilege escalation.  `resolveAdminFranchiseContext` handles
 * multi-franchise users and validates that the requested franchise (if
 * supplied via header) is one the user is actually allowed to access.
 *
 * ## Single-product guard (`GET /admin/products/:id`)
 *
 * Mirrors the store guard: if `req.params.id` is set and the product does not
 * belong to the resolved franchise, a `NOT_FOUND` error is thrown immediately.
 * This prevents a franchise admin from fetching another franchise's product
 * by crafting a direct detail URL.
 */
export const filterAdminProductsByFranchise = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    assertFilterableFieldsReady(req)

    // Resolve ALL franchise IDs the authenticated admin belongs to.
    // An empty array means a verified super-admin (no franchise membership), in
    // which case we skip filtering so they can see every product. A transient
    // resolution failure throws instead of returning [], so it fails closed and
    // can never silently escalate a franchise admin to global access.
    const franchiseIds = await resolveAdminFranchiseScope(
      req as AuthenticatedTenantRequest
    )

    if (!franchiseIds.length) {
      // Super-admin: no franchise restriction — pass through unfiltered.
      return next()
    }

    // Stamp the primary franchise ID onto the request for downstream handlers.
    req.franchise_id = franchiseIds[0]

    // Collect allowed product IDs across ALL of the admin's franchises.
    const productIds = await loadProductIdsForFranchises(req, franchiseIds)

    // -----------------------------------------------------------------------
    // Single-product guard: GET /admin/products/:id
    // -----------------------------------------------------------------------
    const requestedProductId = req.params?.id
    if (requestedProductId) {
      if (!productIds.includes(requestedProductId)) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "Product not found"
        )
      }
    } else if (!productIds.length) {
      // CRITICAL: Medusa ignores an empty `id: []` filter and would return the
      // entire global catalogue. A franchise admin whose franchise has no
      // products must get an empty list, so short-circuit here.
      res.status(200).json({ products: [], count: 0, offset: 0, limit: 0 })
      return
    }

    applyProductIdFilter(req, productIds)

    next()
  } catch (err: unknown) {
    next(err)
  }
}

// ---------------------------------------------------------------------------
// Middleware #3 — Admin product mutation guard  (POST/DELETE /admin/products/:id
//                 and all /admin/products/:id/* sub-routes)
// ---------------------------------------------------------------------------

/**
 * `guardAdminProductMutation`
 *
 * Pure ownership pre-check for product mutations and their sub-routes
 * (variants, options, images, inventory-item links). Unlike
 * `filterAdminProductsByFranchise`, this guard does NOT read or mutate
 * `req.filterableFields`, so it works on mutation routes that have no query
 * config (e.g. `/admin/products/:id/images/:image_id/variants/batch`) without
 * tripping `assertFilterableFieldsReady`.
 *
 * It verifies that the `:id` route param (the parent product) belongs to one of
 * the caller's franchises and throws a clean 404 otherwise. Super admins (no
 * franchise membership) pass through unrestricted, mirroring
 * `filterAdminProductsByFranchise`.
 */
export const guardAdminProductMutation = async (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const requestedProductId = req.params?.id
    // Batch/no-id mutation routes carry no parent product in the path; there is
    // nothing to scope here (list-level batch routes are guarded elsewhere).
    if (!requestedProductId) {
      return next()
    }

    // Empty array → verified super-admin (unrestricted). A transient resolution
    // failure throws and fails closed rather than escalating to super-admin.
    const franchiseIds = await resolveAdminFranchiseScope(
      req as AuthenticatedTenantRequest
    )

    if (!franchiseIds.length) {
      // Super-admin: unrestricted.
      return next()
    }

    const productIds = await loadProductIdsForFranchises(req, franchiseIds)
    if (!productIds.includes(requestedProductId)) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}
