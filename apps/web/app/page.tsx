/**
 * /app/page.tsx — Franchise-Scoped Home Page
 *
 * Key design decisions
 * ────────────────────
 * • `export const dynamic = "force-dynamic"` — prevents Next.js from statically
 *   rendering this page at build time. Because product data is tied to the
 *   `franchise_id` cookie (a per-user signal), every request must hit the
 *   server so the correct catalog is fetched. Without this flag, Next.js would
 *   cache a single response and serve it to all users regardless of their
 *   selected franchise.
 *
 * • Cookie guard (server-side) — `cookies()` is called once at the page level
 *   so the check is co-located with the render decision. If no `franchise_id`
 *   is present the page renders a full-screen fallback prompt rather than
 *   exposing an empty/global product grid.
 *
 * • `<Suspense>` streaming — the hero renders instantly while the async
 *   `BentoProductGrid` (which awaits `getMedusaHeaders()` + a Medusa fetch)
 *   streams in behind a skeleton, giving a perceived instant load.
 *
 * • Hero banners + categories are fetched server-side from Medusa (CMS module
 *   and product categories). Components keep static fallbacks when empty.
 */

import { Suspense } from "react";
import { cookies } from "next/headers";

import Header from "./components/Header";
import Footer from "./components/Footer";
import HeroCarousel, {
  type SlideContent,
} from "@/modules/home/components/hero-carousel";
import CuratedByFlavor from "@/modules/home/components/curated-by-flavor";
import {
  categoryImageFromMetadata,
  type CategoryItem,
} from "@/modules/home/lib/category-display";
import SeasonalCollection from "@/modules/home/components/seasonal-collection";
import ConnoisseurClub from "@/modules/home/components/connoisseur-club";
import FooterPromoCards from "@/modules/home/components/footer-promo-cards";
import NoFranchiseFallback from "@/modules/home/components/no-franchise-fallback";
import {
  fetchCatalogueCategories,
  fetchHeroBanners,
} from "@/lib/data/catalogue";

// ─── Force dynamic rendering ──────────────────────────────────────────────────
// Products are scoped to the `franchise_id` cookie — a per-user value that
// Next.js cannot know at build time. We must render on every request.
export const dynamic = "force-dynamic";

// ─── Skeleton shown while SeasonalCollection streams in ────────────────────────
function ProductGridSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-8 w-64 bg-deep-plum/10 rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white border border-outline-variant/20 rounded-3xl overflow-hidden h-[340px] flex flex-col justify-between p-6"
          >
            <div className="aspect-[4/3] bg-deep-plum/10 rounded-2xl w-full" />
            <div className="space-y-2">
              <div className="h-4 w-24 bg-deep-plum/10 rounded" />
              <div className="h-6 w-48 bg-deep-plum/10 rounded" />
            </div>
            <div className="h-6 w-16 bg-deep-plum/10 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  // Read the franchise cookie server-side. Because we opted into force-dynamic
  // above, `cookies()` is always available here (no static-generation guard
  // needed at the page level).
  const cookieStore = await cookies();
  const franchiseId = cookieStore.get("franchise_id")?.value?.trim();

  // Parallel CMS + catalogue meta fetch (graceful empty → component fallbacks)
  const [heroBanners, categories] = await Promise.all([
    fetchHeroBanners(),
    fetchCatalogueCategories(),
  ]);

  const heroSlides: SlideContent[] = heroBanners.map((b) => ({
    tag: b.tag,
    title: b.title,
    titleEmphasis: b.title_emphasis ?? "",
    description: b.description ?? "",
    primaryCta: {
      label: b.primary_cta_label,
      href: b.primary_cta_href || "/cake-catalogue",
    },
    ...(b.secondary_cta_label && b.secondary_cta_href
      ? {
          secondaryCta: {
            label: b.secondary_cta_label,
            href: b.secondary_cta_href,
          },
        }
      : {}),
    imageSrc: b.image_url,
    imageAlt: b.image_alt || b.title,
  }));

  // Cap home-page circles so the grid stays balanced (3×2 / 6-up)
  const categoryItems: CategoryItem[] = categories.slice(0, 12).map((cat, i) => ({
    id: cat.id,
    name: cat.name,
    handle: cat.handle,
    imageSrc: categoryImageFromMetadata(cat.metadata, i),
    href: `/cake-catalogue?cats=${encodeURIComponent(cat.handle)}`,
  }));

  return (
    <div>
      <Header />

      <main className="pb-20 bg-[#F5F0F9]">
        <div className="max-w-[1440px] mx-auto px-margin-mobile md:px-margin-desktop py-12 md:py-20 space-y-20">
          
          {/* 1. Hero sliding carousel (CMS-driven with static fallback) */}
          <HeroCarousel slides={heroSlides} />

          {/* 2. Product categories (dynamic circles → catalogue filter) */}
          <CuratedByFlavor categories={categoryItems} />

          {/* 3. The Seasonal Collection product cards */}
          {franchiseId ? (
            <Suspense fallback={<ProductGridSkeleton />}>
              <SeasonalCollection franchiseId={franchiseId} />
            </Suspense>
          ) : (
            <NoFranchiseFallback autoRedirect={true} redirectDelay={5000} />
          )}

          {/* 4. Connoisseur Club membership card */}
          <ConnoisseurClub />

          {/* 5. Sweet Rewards & Lightning Service cards */}
          <FooterPromoCards />
        </div>
      </main>
      <Footer />
    </div>
  );
}
