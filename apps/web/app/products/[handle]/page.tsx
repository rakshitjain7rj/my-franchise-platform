/**
 * /products/[handle]/page.tsx — Product Detail Page (Server Component)
 *
 * Key design decisions
 * ────────────────────
 * • `dynamic = "force-dynamic"` — the product data is franchise-scoped
 *   via the `franchise_id` cookie. Every request must hit the server so
 *   the backend middleware can enforce tenant isolation.
 *
 * • No franchise guard needed here. The Next.js Middleware (middleware.ts)
 *   intercepts every request at the edge, checks for the `franchise_id`
 *   cookie, and redirects unauthenticated users to /map-routing before
 *   this page ever renders. This page can safely assume the cookie exists.
 *
 * • `getMedusaHeaders()` injects both `x-franchise-id` and the publishable
 *   API key, matching the pattern established in the home page product grid.
 *
 * • The page fetches a single product by handle from `/store/products` with
 *   a `handle` filter, then passes the full product object to the interactive
 *   `ProductDetail` client component.
 *
 * • `<Suspense>` streams the related-products section behind a skeleton so
 *   the primary content renders immediately.
 *
 * • If the product is not found (empty result or 404), `notFound()` renders
 *   Next.js's built-in 404 page.
 */

import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";

import Header from "../../components/Header";
import Footer from "../../components/Footer";
import ProductDetail from "@/modules/product/components/product-detail";
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
  ["product-detail-cache"],
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

  const dietaryTags = await getProductDietaryTags(product.id);

  return (
    <div>
      <Header />

      <main className="pb-20 bg-[#FDFBFE]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-margin-mobile md:px-margin-desktop pb-12 pt-20 sm:pt-8 md:pb-20 space-y-16 sm:space-y-20">
          {/* ── Product Detail ─────────────────────────────────────────── */}
          <ProductDetail product={product} dietaryTags={dietaryTags} />

          {/* ── Related Products (streamed) ────────────────────────────── */}
          <Suspense fallback={<RelatedSkeleton />}>
            <RelatedProducts currentProductId={product.id} />
          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  );
}
