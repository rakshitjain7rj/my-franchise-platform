import React from "react";
import Link from "next/link";
import { getMedusaHeaders } from "@/lib/medusa/headers";
import { unstable_cache } from "next/cache";

interface ProductImage {
  url: string;
}

interface ProductVariant {
  calculated_price?: {
    calculated_amount: number;
    original_amount?: number;
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

const MEDUSA_BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "http://localhost:9000";

let regionIdPromise: Promise<string | null> | null = null;

function getDefaultRegionId(): Promise<string | null> {
  if (!regionIdPromise) {
    regionIdPromise = (async () => {
      try {
        const response = await fetch(`${MEDUSA_BACKEND_URL}/store/regions`, {
          headers: {
            "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
          },
          next: { revalidate: 3600 },
        });
        if (!response.ok) return null;
        const json = await response.json();
        return json.regions?.[0]?.id ?? null;
      } catch (err) {
        console.error("[SeasonalCollection] Failed to fetch default region:", err);
        return null;
      }
    })();
  }
  return regionIdPromise;
}

const getCachedSeasonalProducts = unstable_cache(
  async (
    limit: number,
    franchiseId: string | undefined,
    storeLocationId: string | undefined,
    regionId: string | null
  ): Promise<MedusaProduct[]> => {
    try {
      const regionParam = regionId ? `&region_id=${regionId}` : "";
      const url = `${MEDUSA_BACKEND_URL}/store/products?limit=${limit}&fields=id,title,handle,description,thumbnail,images,variants,variants.calculated_price${regionParam}`;

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

      if (!response.ok) return [];
      const json: ProductsResponse = await response.json();
      return json.products ?? [];
    } catch (error) {
      console.error("[SeasonalCollection] Failed to fetch products:", error);
      return [];
    }
  },
  ["seasonal-products-cache"],
  {
    revalidate: 60,
    tags: ["products"],
  }
);

async function fetchFranchiseProducts(limit = 4): Promise<MedusaProduct[]> {
  const headers = await getMedusaHeaders();
  const franchiseId = headers["x-franchise-id"];
  const storeLocationId = headers["x-store-location-id"];
  const regionId = await getDefaultRegionId();

  return getCachedSeasonalProducts(limit, franchiseId, storeLocationId, regionId);
}

// ── Mock Fallback Products (used only when the franchise has no products yet)
type DisplayProduct = {
  id: string;
  title: string;
  handle: string;
  category?: string;
  price: string;
  originalPrice?: string;
  rating?: number;
  imageSrc: string;
  badge?: string;
  saveTag?: string;
};

const mockProducts: DisplayProduct[] = [
  {
    id: "mock-1",
    title: "Autumn Spice Cupcakes",
    handle: "autumn-spice-cupcakes",
    category: "SEASONAL SELECTION",
    price: "$12.50",
    originalPrice: "$15.00",
    rating: 4.8,
    imageSrc: "/images/products/autumn-cupcake.png",
    badge: "LIMITED",
    saveTag: "SAVE 15%",
  },
  {
    id: "mock-2",
    title: "Lavender Macarons",
    handle: "lavender-macarons",
    category: "PETITE SWEET",
    price: "$18.00",
    originalPrice: "$22.00",
    rating: 4.9,
    imageSrc: "/images/products/lavender-macarons.png",
  },
  {
    id: "mock-3",
    title: "Glazed Croissants",
    handle: "glazed-croissants",
    category: "VIENNOISERIE",
    price: "$9.99",
    originalPrice: "$12.50",
    rating: 4.7,
    imageSrc: "/images/products/glazed-croissant.png",
  },
  {
    id: "mock-4",
    title: "Velvet Berry Tart",
    handle: "velvet-berry-tart",
    category: "PATISSERIE SPECIALTY",
    price: "$14.50",
    originalPrice: "$19.00",
    rating: 4.8,
    imageSrc: "/images/products/berry-tart.png",
  },
];

export default async function SeasonalCollection({
  franchiseId,
}: {
  franchiseId?: string;
}) {
  const dbProducts = await fetchFranchiseProducts(4);

  // Map to common layout shape using only real Medusa data. No fabricated
  // price, discount, rating, or badge — if a variant has no calculated_price
  // yet (e.g. a franchise still setting up its catalogue), the card shows
  // "Price unavailable", the same honest fallback used on the product page.
  const displayProducts: DisplayProduct[] =
    dbProducts.length >= 4
      ? dbProducts.map((p) => {
          const calculatedPrice = p.variants?.[0]?.calculated_price;
          const currency = calculatedPrice?.currency_code?.toUpperCase() ?? "GBP";
          const hasDiscount =
            calculatedPrice?.original_amount != null &&
            calculatedPrice.original_amount > calculatedPrice.calculated_amount;

          return {
            id: p.id,
            title: p.title,
            handle: p.handle,
            price: calculatedPrice
              ? new Intl.NumberFormat("en-GB", {
                  style: "currency",
                  currency,
                }).format(calculatedPrice.calculated_amount)
              : "Price unavailable",
            originalPrice:
              hasDiscount && calculatedPrice
                ? new Intl.NumberFormat("en-GB", {
                    style: "currency",
                    currency,
                  }).format(calculatedPrice.original_amount!)
                : undefined,
            imageSrc: p.thumbnail ?? p.images?.[0]?.url ?? "/images/products/placeholder.png",
          };
        })
      : mockProducts;

  return (
    <section className="space-y-8" aria-label="Seasonal Collection">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-outline-variant/20 pb-4">
        <h2 className="font-headline text-2xl md:text-3xl font-extrabold text-deep-plum">
          The Seasonal Collection
        </h2>
        <Link
          href="/cake-catalogue"
          className="group flex items-center gap-1.5 text-vibrant-magenta font-label-bold text-xs uppercase tracking-widest hover:text-deep-plum transition-colors"
        >
          View Catalogue
          <span className="material-symbols-outlined !text-[16px] group-hover:translate-x-1 transition-transform">
            arrow_forward
          </span>
        </Link>
      </div>

      {/* Grid of 4 Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        {displayProducts.map((product) => (
          <Link
            key={product.id}
            href={`/products/${product.handle}`}
            className="
              group
              bg-white
              border border-outline-variant/30
              rounded-3xl
              overflow-hidden
              premium-shadow
              hover:shadow-[0_20px_45px_-10px_rgba(74,21,75,0.15)]
              hover:-translate-y-2
              transition-all duration-300
              flex flex-col
              h-full
            "
          >
            {/* Image Container */}
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-lavender-bg">
              <img
                src={product.imageSrc}
                alt={product.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />

              {/* Badges on Image */}
              {product.badge && (
                <span className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm text-white px-3 py-1 rounded-full text-[9px] font-label-bold tracking-widest uppercase shadow-sm">
                  {product.badge}
                </span>
              )}
            </div>

            {/* Card Body */}
            <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-1">
                {/* Category & Rating (mock-fallback only — no real backing data) */}
                {(product.category || product.rating != null) && (
                  <div className="flex items-center justify-between">
                    {product.category && (
                      <span className="text-[10px] font-label-bold tracking-widest text-outline uppercase">
                        {product.category}
                      </span>
                    )}
                    {product.rating != null && (
                      <div className="flex items-center gap-1 text-[11px] font-label-bold text-vibrant-magenta bg-vibrant-magenta/5 px-2 py-0.5 rounded-full">
                        <span className="material-symbols-outlined !text-[12px] text-vibrant-magenta fill-vibrant-magenta">
                          star
                        </span>
                        {product.rating}
                      </div>
                    )}
                  </div>
                )}

                {/* Title */}
                <h3 className="font-headline font-bold text-base text-deep-plum group-hover:text-vibrant-magenta transition-colors line-clamp-1">
                  {product.title}
                </h3>
              </div>

              {/* Pricing & Tag */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-extrabold text-deep-plum">
                    {product.price}
                  </span>
                  {product.originalPrice && (
                    <span className="text-xs font-semibold text-outline/65 line-through">
                      {product.originalPrice}
                    </span>
                  )}
                </div>

                {product.saveTag && (
                  <span className="bg-[#ffd8e6] text-on-secondary-fixed-variant px-2 py-1 rounded text-[9px] font-label-bold tracking-wide uppercase">
                    {product.saveTag}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
