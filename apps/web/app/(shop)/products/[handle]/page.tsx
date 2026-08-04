/**
 * /products/[handle]/page.tsx — Product Detail Page (Server Component)
 *
 * Key design decisions
 * ────────────────────
 * • `dynamic = "force-dynamic"` — the product data is franchise-scoped
 *   via the `franchise_id` cookie. Every request must hit the server so
 *   the backend middleware can enforce tenant isolation.
 *
 * • Shared `(shop)/layout` owns Header/Footer so chrome does not wait on
 *   Medusa product fetches during catalogue → PDP soft navigations.
 *
 * • Product payload is awaited first; dietary tags stream behind Suspense
 *   so title/price/gallery can paint without the dietary-tags HTTP call.
 *
 * • `<Suspense>` streams the related-products section behind a skeleton.
 *
 * • If the product is not found (empty result or 404), `notFound()` renders
 *   Next.js's built-in 404 page.
 */

import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";

import ProductDetail from "@/modules/product/components/product-detail";
import {
  DietaryTagBadges,
  DietaryTagInfoRows,
  DietaryTagsBadgesSkeleton,
} from "@/modules/product/components/product-detail/dietary-tags-ui";
import RelatedProducts from "@/modules/product/components/related-products";
import type {
  DietaryTag,
  MedusaProduct,
} from "@/modules/product/components/product-detail";
import { getMedusaHeaders } from "@/lib/medusa/headers";

// ─── Force dynamic rendering ──────────────────────────────────────────────────
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

const MEDUSA_BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "http://localhost:9000";

interface ProductsApiResponse {
  products: MedusaProduct[];
  count: number;
}

// Wrapped in React `cache()` so it runs at most once per request (shared
// between generateMetadata and the page component). Regions are global — not
// franchise-scoped — so the response is also cached across requests.
const getDefaultRegionId = cache(async (): Promise<string | null> => {
  try {
    const response = await fetch(
      `${MEDUSA_BACKEND_URL}/store/regions`,
      {
        headers: {
          "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
        },
        // Global, rarely-changing data → safe to cache across requests.
        next: { revalidate: 3600 },
      }
    );
    if (!response.ok) return null;
    const json = await response.json();
    return json.regions?.[0]?.id ?? null;
  } catch (err) {
    console.error("[ProductDetailPage] Failed to fetch default region:", err);
    return null;
  }
});

// Explicit field list keeps payloads small. `+material` / `+metadata` force
// inclusion of cake ingredients, allergens, and storage metadata used by
// ProductDetail (Medusa omits some scalars when a sparse fields list is used).
const PRODUCT_DETAIL_FIELDS = [
  "id",
  "title",
  "handle",
  "description",
  "subtitle",
  "thumbnail",
  "images.id",
  "images.url",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.calculated_price",
  "variants.metadata",
  "variants.options.id",
  "variants.options.value",
  "variants.options.option_id",
  "variants.options.option.id",
  "variants.options.option.title",
  "+variants.inventory_quantity",
  "options.id",
  "options.title",
  "options.values.id",
  "options.values.value",
  "+material",
  "+metadata",
  "tags.id",
  "tags.value",
  "categories.id",
  "categories.name",
  "categories.handle",
  "collection.id",
  "collection.title",
  "collection.handle",
  "type.id",
  "type.value",
].join(",");

const getCachedProductByHandle = unstable_cache(
  async (
    handle: string,
    franchiseId: string | undefined,
    storeLocationId: string | undefined,
    regionId: string | null
  ): Promise<MedusaProduct | null> => {
    try {
      const url = new URL(`${MEDUSA_BACKEND_URL}/store/products`);
      url.searchParams.set("handle", handle);
      url.searchParams.set("limit", "1");
      if (regionId) {
        url.searchParams.set("region_id", regionId);
      }
      url.searchParams.set("fields", PRODUCT_DETAIL_FIELDS);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
      };
      if (franchiseId) {
        headers["x-franchise-id"] = franchiseId;
      }
      if (storeLocationId) {
        headers["x-store-location-id"] = storeLocationId;
      }

      const response = await fetch(url.toString(), {
        headers,
        cache: "no-store", // avoid double-caching under unstable_cache
      });

      if (!response.ok) {
        console.error(
          `[ProductDetailPage] Medusa returned ${response.status} for handle "${handle}"`
        );
        return null;
      }

      const json: ProductsApiResponse = await response.json();
      return json.products?.[0] ?? null;
    } catch (error) {
      console.error("[ProductDetailPage] Failed to fetch product:", error);
      return null;
    }
  },
  // v2: includes product categories for jam-filling cake detection
  ["product-detail-cache-v2"],
  {
    revalidate: 60,
    tags: ["products"],
  }
);

// Wrapped in React `cache()` so the duplicate calls from generateMetadata and
// the page component collapse into a single backend request per render.
const getProductByHandle = cache(async (
  handle: string
): Promise<MedusaProduct | null> => {
  const headers = await getMedusaHeaders();
  const franchiseId = headers["x-franchise-id"];
  const storeLocationId = headers["x-store-location-id"];
  const regionId = await getDefaultRegionId();

  return getCachedProductByHandle(handle, franchiseId, storeLocationId, regionId);
});

/**
 * Fetches dietary tags linked via product-dietary-tag. Runs per request
 * (not unstable_cache) so franchise scoping always reflects the active cookie.
 * React `cache()` dedupes multiple streamed slots in one request.
 */
const getProductDietaryTags = cache(
  async (productId: string): Promise<DietaryTag[]> => {
    try {
      const headers = await getMedusaHeaders();
      const res = await fetch(
        `${MEDUSA_BACKEND_URL}/store/products/${encodeURIComponent(productId)}/dietary-tags`,
        {
          headers,
          cache: "no-store",
        }
      );
      if (!res.ok) return [];
      const json = (await res.json()) as { dietary_tags?: DietaryTag[] };
      return json.dietary_tags ?? [];
    } catch (err) {
      console.error("[ProductDetailPage] Failed to fetch dietary tags:", err);
      return [];
    }
  }
);

/**
 * Fallback when product-dietary-tag links are missing (e.g. products imported
 * after a backfill, or catalogues larger than an old take:500 seed).
 * Uses metadata.scraped_dietary written by scrape / cake-card fix scripts.
 */
const DIETARY_TAG_COPY: Record<string, { name: string; description: string }> =
  {
    eggless: {
      name: "Eggless",
      description: "Prepared without eggs. Uses plant-based binders.",
    },
    vegan: {
      name: "Vegan",
      description: "Plant-based recipe with no animal products.",
    },
    "dairy-free": {
      name: "Dairy-free",
      description: "Made without dairy milk or butter.",
    },
    "gluten-free": {
      name: "Gluten-free",
      description: "Made without gluten-containing grains.",
    },
  };

function dietaryTagsFromMetadata(
  metadata?: Record<string, unknown> | null
): DietaryTag[] {
  const raw = metadata?.scraped_dietary;
  const names: string[] = Array.isArray(raw)
    ? raw.map(String).map((s) => s.trim()).filter(Boolean)
    : typeof raw === "string" && raw.trim()
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  return names.map((name, i) => {
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const known = DIETARY_TAG_COPY[slug];
    return {
      id: `meta-dietary-${i}-${slug}`,
      name: known?.name ?? name,
      slug,
      description: known?.description ?? null,
    };
  });
}

async function resolveDietaryTags(
  productId: string,
  metadata?: Record<string, unknown> | null
): Promise<DietaryTag[]> {
  const linked = await getProductDietaryTags(productId);
  return linked.length > 0 ? linked : dietaryTagsFromMetadata(metadata);
}

async function StreamedDietaryBadges({
  productId,
  metadata,
}: {
  productId: string;
  metadata?: Record<string, unknown> | null;
}) {
  const tags = await resolveDietaryTags(productId, metadata);
  return <DietaryTagBadges tags={tags} />;
}

async function StreamedDietaryInfo({
  productId,
  metadata,
}: {
  productId: string;
  metadata?: Record<string, unknown> | null;
}) {
  const tags = await resolveDietaryTags(productId, metadata);
  return <DietaryTagInfoRows tags={tags} />;
}

// ---------------------------------------------------------------------------
// Dynamic SEO metadata
// ---------------------------------------------------------------------------

type PageParams = Promise<{ handle: string }>;

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  const { handle } = await params;
  const product = await getProductByHandle(handle);

  if (!product) {
    return { title: "Product Not Found | Cake Break" };
  }

  return {
    title: `${product.title} | Cake Break`,
    description:
      product.description?.slice(0, 160) ??
      `Discover ${product.title} — artisan patisserie from Cake Break.`,
    openGraph: {
      title: product.title,
      description: product.description ?? undefined,
      images: product.thumbnail ? [{ url: product.thumbnail }] : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Related Products Skeleton
// ---------------------------------------------------------------------------

function RelatedSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-64 bg-deep-plum/10 rounded-xl" />
        <div className="h-4 w-48 bg-deep-plum/5 rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-gutter">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[220px] md:h-[280px] bg-deep-plum/10 rounded-2xl"
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
//
// Franchise guard is NOT needed here — middleware.ts handles it globally
// before this component is ever invoked.
// ---------------------------------------------------------------------------

export default async function ProductDetailPage({
  params,
}: {
  params: PageParams;
}) {
  const { handle } = await params;
  const product = await getProductByHandle(handle);

  if (!product) {
    notFound();
  }

  // Metadata tags are free (from product payload) — use as Suspense fallback
  // so badges can appear immediately while linked tags stream in.
  const metadataTags = dietaryTagsFromMetadata(product.metadata);

  return (
    <main className="pb-20 bg-page-bg">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-margin-mobile md:px-margin-desktop pb-12 pt-20 sm:pt-8 md:pb-20 space-y-16 sm:space-y-20">
        {/* ── Product Detail (product first; tags streamed) ─────────────── */}
        <ProductDetail
          product={product}
          dietaryTags={metadataTags}
          dietaryBadgesSlot={
            <Suspense
              fallback={
                metadataTags.length > 0 ? (
                  <DietaryTagBadges tags={metadataTags} />
                ) : (
                  <DietaryTagsBadgesSkeleton />
                )
              }
            >
              <StreamedDietaryBadges
                productId={product.id}
                metadata={product.metadata}
              />
            </Suspense>
          }
          dietaryInfoSlot={
            <Suspense
              fallback={
                metadataTags.length > 0 ? (
                  <DietaryTagInfoRows tags={metadataTags} />
                ) : null
              }
            >
              <StreamedDietaryInfo
                productId={product.id}
                metadata={product.metadata}
              />
            </Suspense>
          }
        />

        {/* ── Related Products (streamed) ────────────────────────────── */}
        <Suspense fallback={<RelatedSkeleton />}>
          <RelatedProducts currentProductId={product.id} />
        </Suspense>
      </div>
    </main>
  );
}
