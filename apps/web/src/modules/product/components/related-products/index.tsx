import Link from "next/link";
import {
  fetchCatalogueProducts,
  formatVariantPrice,
  getCheapestVariant,
} from "@/lib/data/catalogue";

// ---------------------------------------------------------------------------
// Server Component — fetches real, franchise-scoped products from Medusa so
// this section reflects the live admin-panel catalogue rather than mock data.
// ---------------------------------------------------------------------------

export default async function RelatedProducts({
  currentProductId,
}: {
  currentProductId: string;
}) {
  // Over-fetch slightly so we still have 8 cards after excluding the
  // current product from the results.
  const { products } = await fetchCatalogueProducts(9, 0, {
    sort: "created_at",
  });

  const otherCakes = products
    .filter((product) => product.id !== currentProductId)
    .slice(0, 8);

  if (otherCakes.length === 0) {
    return null;
  }

  return (
    <section className="space-y-6 pt-10" aria-label="More cakes you may like">
      {/* Accent Header */}
      <div className="flex items-center gap-4">
        <h2 className="font-headline-xl text-2xl md:text-3xl text-primary font-extrabold whitespace-nowrap">
          More Cakes You May Like
        </h2>
        <div className="w-24 h-1.5 bg-secondary rounded-full mt-1 flex-shrink-0" />
        <div className="w-full h-px bg-outline-variant/30 mt-1" />
      </div>

      {/* Grid containing up to 8 real cakes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        {otherCakes.map((cake) => {
          const imageUrl = cake.thumbnail ?? cake.images?.[0]?.url;
          const cheapestVariant = getCheapestVariant(cake.variants);
          const priceStr = cheapestVariant
            ? formatVariantPrice(cheapestVariant)
            : null;

          return (
            <article
              key={cake.id}
              className="group relative flex flex-col bg-white rounded-3xl overflow-hidden border border-outline-variant/20 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 p-3 text-center"
            >
              {/* Image Container */}
              <div className="relative aspect-square w-full overflow-hidden bg-lavender-bg rounded-2xl mb-3">
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt={cake.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
              </div>

              {/* Title & Price */}
              <div className="flex-grow flex flex-col justify-between items-center gap-1 min-h-[4.5rem]">
                <h3 className="font-headline font-bold text-xs text-primary line-clamp-2 leading-snug px-1">
                  {cake.title}
                </h3>
                {priceStr && (
                  <p className="text-secondary font-bold text-[13px] mt-1">
                    {priceStr}
                  </p>
                )}
              </div>

              {/* View Details Button */}
              <Link
                href={`/products/${cake.handle}`}
                className="mt-3 block w-full text-center border border-secondary text-secondary hover:bg-secondary hover:text-white rounded-full py-1.5 text-[11px] font-bold transition-all"
              >
                View Details
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
