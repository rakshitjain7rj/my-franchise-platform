/**
 * src/lib/data/catalogue.ts
 *
 * Franchise-scoped catalogue data-fetching layer.
 *
 * All queries go through `getMedusaHeaders()` which injects:
 *   • x-publishable-api-key
 *   • x-franchise-id  (from the `franchise_id` cookie, when present)
 *
 * The backend `filterStoreProductsByFranchise` middleware enforces strict
 * tenant isolation — only products linked to the cookie's franchise are
 * returned. No client-side filtering by franchise is needed here.
 *
 * This module is server-only (no "use client") and is safe to import inside
 * RSCs and Next.js Route Handlers.
 */

import { getMedusaHeaders } from "@/lib/medusa/headers";
import { unstable_cache } from "next/cache";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEDUSA_BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "http://localhost:9000";

// Medusa fields to request per product. We deliberately request the full
// variant set so we can render base prices, options, and availability.
const PRODUCT_FIELDS = [
  "id",
  "title",
  "handle",
  "description",
  "thumbnail",
  "images.url",
  "tags",
  "categories.id",
  "categories.name",
  "categories.handle",
  "collection_id",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.calculated_price",
  "variants.options",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.inventory_quantity",
  "options",
  "options.values",
].join(",");



let regionIdPromise: Promise<string | null> | null = null;

/**
 * Fetches the default region ID from the Medusa backend.
 */
function getDefaultRegionId(): Promise<string | null> {
  if (!regionIdPromise) {
    regionIdPromise = (async () => {
      try {
        const response = await fetch(
          `${MEDUSA_BACKEND_URL}/store/regions`,
          {
            headers: {
              "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
            },
            next: { revalidate: 3600 },
          }
        );
        if (!response.ok) return null;
        const json = await response.json();
        return json.regions?.[0]?.id ?? null;
      } catch (err) {
        console.error("[catalogue] Failed to fetch default region:", err);
        return null;
      }
    })();
  }
  return regionIdPromise;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogueTag {
  id: string;
  value: string;
}

export interface CatalogueCategory {
  id: string;
  name: string;
  handle: string;
}

export interface CatalogueVariantOption {
  option_id: string;
  option: { title: string } | null;
  value: string;
}

export interface CatalogueVariant {
  id: string;
  title: string;
  sku: string | null;
  inventory_quantity: number;
  allow_backorder: boolean;
  manage_inventory: boolean;
  calculated_price?: {
    calculated_amount: number;
    original_amount: number;
    currency_code: string;
  };
  options: CatalogueVariantOption[];
}

export interface CatalogueProductOption {
  id: string;
  title: string;
  values: { value: string }[];
}

export interface CatalogueProduct {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  thumbnail: string | null;
  images: { url: string }[];
  tags: CatalogueTag[];
  categories: CatalogueCategory[];
  variants: CatalogueVariant[];
  options: CatalogueProductOption[];
}

export type SortKey = "price_asc" | "price_desc" | "title_asc" | "created_at";

export interface CatalogueFilters {
  /** Medusa product_tag values (OR logic — any match). */
  tags?: string[];
  /** Tag IDs to filter by. */
  tagIds?: string[];
  /**
   * Category handles (from URL `cats=`) — resolved to IDs before the Medusa call.
   * Prefer handles in the UI so URLs stay human-readable and bookmarkable.
   */
  categories?: string[];
  /** Category IDs already resolved (skip handle lookup). */
  categoryIds?: string[];
  /** Explicit product ID allow-list. */
  productIds?: string[];
  /** Free-text search (Medusa `q` — title / description). */
  q?: string;
  /** Sort order. */
  sort?: SortKey;
  /**
   * Sponge / flavour handle (e.g. "chocolate", "victoria", "red-velvet").
   * Applied server-side via franchise product middleware (SQL on option values).
   */
  flavour?: string;
  /** Max price in major units (GBP). Server-side via middleware. */
  maxPrice?: number;
  /** Min price in major units (GBP). Server-side via middleware. */
  minPrice?: number;
}

interface MedusaProductsResponse {
  products: CatalogueProduct[];
  count: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

/**
 * Builds a URLSearchParams string for the Medusa Store API.
 *
 * Native Medusa params: limit, offset, order, q, tag_id[], category_id[], id[].
 *
 * Custom catalogue params (stripped by backend `captureCatalogueQueryFilters`
 * before Medusa's zod validator, then applied as SQL on the product allow-list):
 *  - sponge / flavour
 *  - min_price / max_price
 */
function buildQueryString(
  limit: number,
  offset: number,
  filters?: CatalogueFilters
): string {
  const params = new URLSearchParams();

  params.set("limit", String(limit));
  params.set("offset", String(offset));
  params.set("fields", PRODUCT_FIELDS);

  // Free-text search
  if (filters?.q?.trim()) {
    params.set("q", filters.q.trim());
  }

  // Sort
  if (filters?.sort) {
    switch (filters.sort) {
      case "price_asc":
        params.set("order", "variants.calculated_price.calculated_amount");
        break;
      case "price_desc":
        params.set("order", "-variants.calculated_price.calculated_amount");
        break;
      case "title_asc":
        params.set("order", "title");
        break;
      case "created_at":
        params.set("order", "-created_at");
        break;
    }
  }

  // Tag ID filter (Medusa v2 expects tag_id[]=id1&tag_id[]=id2)
  if (filters?.tagIds?.length) {
    for (const tagId of filters.tagIds) {
      params.append("tag_id[]", tagId);
    }
  }

  // Category filter — IDs only
  if (filters?.categoryIds?.length) {
    for (const catId of filters.categoryIds) {
      params.append("category_id[]", catId);
    }
  }

  // Explicit product allow-list (dietary resolution, etc.)
  if (filters?.productIds?.length) {
    for (const id of filters.productIds) {
      params.append("id[]", id);
    }
  }

  // Server-side sponge / price (backend middleware)
  if (filters?.flavour?.trim()) {
    params.set("sponge", filters.flavour.trim());
  }
  if (filters?.minPrice != null && filters.minPrice > 0) {
    params.set("min_price", String(filters.minPrice));
  }
  if (filters?.maxPrice != null && filters.maxPrice > 0) {
    params.set("max_price", String(filters.maxPrice));
  }

  return params.toString();
}

// ---------------------------------------------------------------------------
// Caching Layers (unstable_cache wrapped calls)
// ---------------------------------------------------------------------------

const getCachedProducts = unstable_cache(
  async (
    limit: number,
    offset: number,
    qs: string,
    franchiseId: string,
    storeLocationId: string,
    regionId: string | null
  ): Promise<{ products: CatalogueProduct[]; count: number }> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-publishable-api-key":
        process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_MEDUSA_API_KEY ??
        "",
    };
    if (franchiseId) {
      headers["x-franchise-id"] = franchiseId;
    }
    if (storeLocationId) {
      headers["x-store-location-id"] = storeLocationId;
    }

    const regionParam = regionId ? `&region_id=${regionId}` : "";
    const response = await fetch(
      `${MEDUSA_BACKEND_URL}/store/products?${qs}${regionParam}`,
      {
        headers,
        cache: "no-store", // avoid double-caching under unstable_cache
      }
    );

    if (!response.ok) {
      console.error(
        `[catalogue] Medusa /store/products returned ${response.status}`
      );
      return { products: [], count: 0 };
    }

    const json: MedusaProductsResponse = await response.json();
    return { products: json.products ?? [], count: json.count ?? 0 };
  },
  ["catalogue-products-cache"],
  {
    revalidate: 60,
    tags: ["products"],
  }
);

const getCachedTags = unstable_cache(
  async (franchiseId: string): Promise<CatalogueTag[]> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-publishable-api-key":
        process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_MEDUSA_API_KEY ??
        "",
    };
    if (franchiseId) {
      headers["x-franchise-id"] = franchiseId;
    }

    const response = await fetch(
      `${MEDUSA_BACKEND_URL}/store/product-tags?limit=100`,
      { headers, cache: "no-store" }
    );

    if (!response.ok) return [];

    const json: { product_tags: CatalogueTag[] } = await response.json();
    return json.product_tags ?? [];
  },
  ["catalogue-tags-cache"],
  {
    revalidate: 300,
    tags: ["catalogue-meta"],
  }
);

const getCachedCategories = unstable_cache(
  async (franchiseId: string): Promise<CatalogueCategory[]> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-publishable-api-key":
        process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_MEDUSA_API_KEY ??
        "",
    };
    if (franchiseId) {
      headers["x-franchise-id"] = franchiseId;
    }

    // Only active, non-internal categories (hides Medusa demo leftovers).
    const response = await fetch(
      `${MEDUSA_BACKEND_URL}/store/product-categories?limit=100&fields=id,name,handle,rank&include_descendants_tree=false`,
      { headers, cache: "no-store" }
    );

    if (!response.ok) return [];

    const json: { product_categories: CatalogueCategory[] } =
      await response.json();
    const cats = json.product_categories ?? [];
    // Prefer stable sort by name so the filter dropdown is predictable
    return [...cats].sort((a, b) => a.name.localeCompare(b.name));
  },
  ["catalogue-categories-cache-v2"],
  {
    revalidate: 60,
    tags: ["catalogue-meta"],
  }
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve filter handles/slugs → Medusa IDs (tags, categories).
 */
async function resolveFilterIds(
  filters?: CatalogueFilters
): Promise<CatalogueFilters | undefined> {
  if (!filters) return filters;

  let tagIds = filters.tagIds;
  if (filters.tags?.length && !tagIds) {
    const allTags = await fetchCatalogueTags();
    tagIds = filters.tags
      .map((val) =>
        allTags.find((t) => t.value.toLowerCase() === val.toLowerCase())?.id
      )
      .filter((id): id is string => !!id);
  }

  let categoryIds = filters.categoryIds;
  if (filters.categories?.length && !categoryIds?.length) {
    const allCats = await fetchCatalogueCategories();
    categoryIds = filters.categories
      .map((handleOrId) => {
        if (handleOrId.startsWith("pcat_")) return handleOrId;
        return (
          allCats.find(
            (c) => c.handle.toLowerCase() === handleOrId.toLowerCase()
          )?.id ?? null
        );
      })
      .filter((id): id is string => !!id);
  }

  return {
    ...filters,
    tags: undefined,
    categories: undefined,
    tagIds,
    categoryIds,
    productIds: filters.productIds,
  };
}

/**
 * Fetches franchise-scoped products from Medusa with optional filtering.
 *
 * Server-only. Call inside RSCs or Route Handlers.
 *
 * @param limit    - Number of products per page (default 24)
 * @param offset   - Pagination offset (default 0)
 * @param filters  - Optional filter/sort criteria
 */
export async function fetchCatalogueProducts(
  limit = 24,
  offset = 0,
  filters?: CatalogueFilters
): Promise<{ products: CatalogueProduct[]; count: number }> {
  try {
    const headers = await getMedusaHeaders();
    const franchiseId = headers["x-franchise-id"] ?? "";
    const storeLocationId = headers["x-store-location-id"] ?? "";

    const regionId = await getDefaultRegionId();
    const resolved = await resolveFilterIds(filters);
    const qs = buildQueryString(limit, offset, resolved);

    return await getCachedProducts(
      limit,
      offset,
      qs,
      franchiseId,
      storeLocationId,
      regionId
    );
  } catch (err) {
    console.error("[catalogue] Failed to fetch products:", err);
    return { products: [], count: 0 };
  }
}

/**
 * Fetches all distinct product tags available for this franchise.
 */
export async function fetchCatalogueTags(): Promise<CatalogueTag[]> {
  try {
    const headers = await getMedusaHeaders();
    const franchiseId = headers["x-franchise-id"] ?? "";
    return await getCachedTags(franchiseId);
  } catch (err) {
    console.error("[catalogue] Failed to fetch tags:", err);
    return [];
  }
}

/**
 * Fetches all product categories available for this franchise.
 * Used for the category filter panel.
 */
export async function fetchCatalogueCategories(): Promise<CatalogueCategory[]> {
  try {
    const headers = await getMedusaHeaders();
    const franchiseId = headers["x-franchise-id"] ?? "";
    return await getCachedCategories(franchiseId);
  } catch (err) {
    console.error("[catalogue] Failed to fetch categories:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Utility — price formatting
// ---------------------------------------------------------------------------

/**
 * Returns a localised price string for the cheapest variant, or null.
 */
export function formatVariantPrice(variant: CatalogueVariant): string | null {
  const price = variant?.calculated_price;
  if (!price || price.calculated_amount == null) return null;

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: price.currency_code?.toUpperCase() ?? "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price.calculated_amount);
}

/**
 * Returns the cheapest variant (or first if prices unavailable).
 */
export function getCheapestVariant(
  variants: CatalogueVariant[]
): CatalogueVariant | null {
  if (!variants?.length) return null;

  const withPrice = variants.filter(
    (v) => v.calculated_price?.calculated_amount != null
  );
  if (!withPrice.length) return variants[0];

  return withPrice.reduce((cheapest, v) =>
    (v.calculated_price!.calculated_amount <
      cheapest.calculated_price!.calculated_amount)
      ? v
      : cheapest
  );
}

/**
 * Returns true if ANY variant has inventory OR allows backorders.
 */
export function isProductAvailable(product: CatalogueProduct): boolean {
  return product.variants.some(
    (v) =>
      !v.manage_inventory ||
      v.allow_backorder ||
      v.inventory_quantity > 0
  );
}

// ---------------------------------------------------------------------------
// Flavour / sponge matching
// ---------------------------------------------------------------------------

/**
 * Canonical sponge options present on the live import catalogue.
 * URL values are short handles; `needles` match option value text (and
 * title/description fallback) case-insensitively.
 */
export const FLAVOUR_OPTIONS = [
  {
    value: "victoria",
    label: "Victoria sponge",
    needles: ["victoria"],
  },
  {
    value: "chocolate",
    label: "Chocolate",
    needles: ["chocolate"],
  },
  {
    value: "red-velvet",
    label: "Red velvet",
    needles: ["red velvet", "red-velvet"],
  },
] as const;

export type FlavourValue = (typeof FLAVOUR_OPTIONS)[number]["value"];

/** Accept both `flavour` and legacy `flavor` URL params / home-page links. */
export function normalizeFlavourParam(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  const v = raw.trim().toLowerCase().replace(/_/g, "-");
  // Map marketing/home labels → real sponge handles
  const aliases: Record<string, string> = {
    vanilla: "victoria",
    "madagascar-vanilla": "victoria",
    "pure-vanilla": "victoria",
    "victoria-sponge": "victoria",
    "chocolate-sponge": "chocolate",
    "dark-truffle": "chocolate",
    "red velvet": "red-velvet",
    redvelvet: "red-velvet",
  };
  const mapped = aliases[v] ?? v;
  if (FLAVOUR_OPTIONS.some((o) => o.value === mapped)) return mapped;
  // Unknown free-text still useful for title fallback
  return mapped;
}

function isSpongeOrFlavourOptionTitle(title: string): boolean {
  return /^(flavou?r|sponge)(\s*\d+)?$/i.test(title.trim());
}

/**
 * Whether a product offers the given sponge / flavour (option values first,
 * then title + description). Matches live catalogue `Sponge` options.
 */
export function productMatchesFlavour(
  product: CatalogueProduct,
  flavour: string | null | undefined
): boolean {
  const normalized = normalizeFlavourParam(flavour);
  if (!normalized) return true;

  const option = FLAVOUR_OPTIONS.find((o) => o.value === normalized);
  const needles = option
    ? option.needles
    : [normalized.replace(/-/g, " "), normalized];

  const spongeOpt = product.options?.find(
    (opt) => opt?.title && isSpongeOrFlavourOptionTitle(opt.title)
  );

  if (spongeOpt?.values?.length) {
    const values = spongeOpt.values
      .map((v) => v.value?.toLowerCase() ?? "")
      .filter(Boolean);
    if (
      values.some((val) =>
        needles.some((n) => val.includes(n.toLowerCase()))
      )
    ) {
      return true;
    }
    // Product has a sponge option but none match — do not fall through to
    // noisy title matching (avoids "fruit" false positives).
    return false;
  }

  const blob = `${product.title ?? ""} ${product.description ?? ""}`.toLowerCase();
  return needles.some((n) => blob.includes(n.toLowerCase()));
}

export function applyPriceFilter(
  products: CatalogueProduct[],
  minPrice: number,
  maxPrice: number
): CatalogueProduct[] {
  if (minPrice === 0 && maxPrice === 0) return products;

  return products.filter((product) => {
    const prices = product.variants
      .map((v) => v.calculated_price?.calculated_amount)
      .filter((p): p is number => p != null);

    if (!prices.length) return true;

    const cheapest = Math.min(...prices);
    if (minPrice > 0 && cheapest < minPrice) return false;
    if (maxPrice > 0 && cheapest > maxPrice) return false;
    return true;
  });
}

export function applyFlavorFilter(
  products: CatalogueProduct[],
  flavor: string | null
): CatalogueProduct[] {
  if (!flavor) return products;
  return products.filter((p) => productMatchesFlavour(p, flavor));
}
