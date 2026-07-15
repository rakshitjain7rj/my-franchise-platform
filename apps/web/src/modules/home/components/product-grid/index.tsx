/**
 * BentoProductGrid — React Server Component
 *
 * Fetches franchise-scoped products from the Medusa Store API using the
 * `getMedusaHeaders()` utility and renders them in a premium bento-grid layout.
 *
 * This component is intentionally a Server Component (no "use client") so that:
 *  • The header utility can safely call `next/headers`.
 *  • Product data is streamed from the server with no client JS bundle cost.
 *
 * Caching strategy
 * ----------------
 *  The parent page (`/app/page.tsx`) exports `dynamic = "force-dynamic"`, which
 *  means Next.js re-renders every request on the server. This component therefore
 *  uses `cache: "no-store"` on its fetch to guarantee fresh, per-request data
 *  that correctly reflects the user's active `franchise_id` cookie. ISR tags
 *  (`revalidate` / `tags`) would be silently ignored under force-dynamic and are
 *  omitted to keep intent explicit.
 *
 * Graceful degradation
 * --------------------
 *  • If the fetch throws (network error, cold start) → renders an empty state
 *    instead of crashing the page.
 */

import { getMedusaHeaders } from "@/lib/medusa/headers";
import { unstable_cache } from "next/cache";

// ---------------------------------------------------------------------------
// Types (subset of Medusa's StoreProduct shape)
// ---------------------------------------------------------------------------

interface ProductImage {
  url: string;
}

interface ProductVariant {
  calculated_price?: {
    calculated_amount: number;
    currency_code: string;
  };
}

interface MedusaProduct {
  id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  images: ProductImage[];
  variants: ProductVariant[];
  handle: string;
}

interface ProductsResponse {
  products: MedusaProduct[];
  count: number;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

const MEDUSA_BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "http://localhost:9000";

let regionIdPromise: Promise<string | null> | null = null;

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
        console.error("[BentoProductGrid] Failed to fetch default region:", err);
        return null;
      }
    })();
  }
  return regionIdPromise;
}

const getCachedGridProducts = unstable_cache(
  async (
    limit: number,
    franchiseId: string | undefined,
    storeLocationId: string | undefined,
    regionId: string | null
  ): Promise<MedusaProduct[]> => {
    try {
      const regionParam = regionId ? `&region_id=${regionId}` : "";
      const url = `${MEDUSA_BACKEND_URL}/store/products?limit=${limit}&fields=id,title,handle,description,thumbnail,images.id,images.url,variants.id,variants.calculated_price${regionParam}`;

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

      const response = await fetch(url, {
        headers,
        cache: "no-store", // avoid double-caching under unstable_cache
      });

      if (!response.ok) {
        console.error(
          `[BentoProductGrid] Medusa returned ${response.status} for /store/products`
        );
        return [];
      }

      const json: ProductsResponse = await response.json();
      return json.products ?? [];
    } catch (error) {
      console.error("[BentoProductGrid] Failed to fetch products:", error);
      return [];
    }
  },
  ["bento-products-cache"],
  {
    revalidate: 60,
    tags: ["products"],
  }
);

async function fetchFranchiseProducts(
  limit = 6
): Promise<MedusaProduct[]> {
  const headers = await getMedusaHeaders();
  const franchiseId = headers["x-franchise-id"];
  const storeLocationId = headers["x-store-location-id"];
  const regionId = await getDefaultRegionId();

  return getCachedGridProducts(limit, franchiseId, storeLocationId, regionId);
}

// ---------------------------------------------------------------------------
// Price formatting helper
// ---------------------------------------------------------------------------

function formatPrice(variant: ProductVariant): string {
  const price = variant?.calculated_price;
  if (!price) return "";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: price.currency_code?.toUpperCase() ?? "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price.calculated_amount);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProductCard({ product, featured = false }: { product: MedusaProduct; featured?: boolean }) {
  const imageUrl = product.thumbnail ?? product.images?.[0]?.url;
  const firstVariant = product.variants?.[0];
  const priceStr = firstVariant ? formatPrice(firstVariant) : "";

  if (featured) {
    return (
      <a
        href={`/products/${product.handle}`}
        id={`product-featured-${product.id}`}
        className="group relative md:col-span-2 rounded-2xl overflow-hidden premium-shadow h-[320px] md:h-[400px] flex flex-col justify-end bg-deep-plum"
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt={product.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-deep-plum via-deep-plum/40 to-transparent" />

        <div className="relative z-10 p-8 text-white space-y-2">
          <span className="inline-block px-2 py-0.5 rounded bg-vibrant-magenta text-[10px] font-bold uppercase tracking-widest">
            Featured
          </span>
          <h3 className="font-headline-lg text-2xl md:text-3xl leading-tight">
            {product.title}
          </h3>
          {product.description && (
            <p className="text-white/70 text-sm line-clamp-2 max-w-md">
              {product.description}
            </p>
          )}
          <div className="flex items-center gap-4 pt-2">
            {priceStr && (
              <span className="text-lg font-bold">{priceStr}</span>
            )}
            <span className="text-sm font-label-bold border-b border-white/30 hover:border-white transition-colors py-0.5 flex items-center gap-1">
              Order Now
              <span className="material-symbols-outlined !text-[16px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </span>
          </div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={`/products/${product.handle}`}
      id={`product-card-${product.id}`}
      className="group relative rounded-2xl overflow-hidden premium-shadow h-[240px] flex flex-col justify-end bg-lavender-bg"
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={product.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-deep-plum/90 via-deep-plum/20 to-transparent" />
      <div className="relative z-10 p-5 text-white space-y-1">
        <h3 className="font-label-bold text-sm md:text-base leading-tight">
          {product.title}
        </h3>
        {priceStr && (
          <p className="text-vibrant-magenta font-bold text-sm">{priceStr}</p>
        )}
      </div>
    </a>
  );
}

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center space-y-4">
      <span className="material-symbols-outlined text-deep-plum/20 !text-[72px]">
        cake
      </span>
      <p className="font-headline-md text-xl text-deep-plum/60">
        No products available yet
      </p>
      <p className="text-on-surface-variant text-sm max-w-xs">
        Please select your nearest bakery location to browse our exclusive collection.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main server component
// ---------------------------------------------------------------------------

/**
 * Renders a bento-grid of franchise-scoped products.
 *
 * Usage in a Server Component page:
 * ```tsx
 * import BentoProductGrid from "@/modules/home/components/product-grid";
 *
 * export default function HomePage() {
 *   return (
 *     <main>
 *       <BentoProductGrid title="Our Artisan Collection" limit={6} />
 *     </main>
 *   );
 * }
 * ```
 */
export default async function BentoProductGrid({
  title = "Our Artisan Collection",
  subtitle = "Handcrafted exclusively for your location",
  limit = 6,
}: {
  title?: string;
  subtitle?: string;
  limit?: number;
}) {
  const products = await fetchFranchiseProducts(limit);

  return (
    <section className="space-y-8" aria-label="Product grid">
      {/* Section heading */}
      <div className="space-y-2">
        <h2 className="font-headline-xl text-3xl md:text-4xl text-deep-plum leading-tight">
          {title}
        </h2>
        <p className="text-on-surface-variant font-body-md">{subtitle}</p>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        {products.length === 0 ? (
          <EmptyState />
        ) : (
          products.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              // First product gets the wide "featured" treatment
              featured={i === 0}
            />
          ))
        )}
      </div>
    </section>
  );
}
