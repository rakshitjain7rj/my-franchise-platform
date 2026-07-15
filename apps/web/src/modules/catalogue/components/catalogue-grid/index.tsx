/**
 * CatalogueGrid — React Server Component
 *
 * Fetches franchise-scoped products from Medusa, applies server-side filters
 * from URL search params, and renders the product grid.
 *
 * Responsible for:
 *  1. Translating URL params → CatalogueFilters → Medusa query params
 *  2. Paginating results (24 per page)
 *  3. Rendering CakeCard components (client components) inside the RSC tree
 *  4. Rendering an empty state and pagination controls
 *
 * Price filtering (minPrice / maxPrice) is done client-side post-fetch
 * because Medusa v2 Store API doesn't expose direct price range filter params
 * without a price list/rule context.
 */

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  fetchCatalogueProducts,
  normalizeFlavourParam,
  type CatalogueFilters,
  type SortKey,
} from "@/lib/data/catalogue";
import CakeCard from "@/modules/catalogue/components/cake-card";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 24;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogueGridProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
): string | null {
  const v = searchParams[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function parseListParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").filter(Boolean);
}
// ---------------------------------------------------------------------------
// Pagination component
// ---------------------------------------------------------------------------

function PaginationControls({
  currentPage,
  totalPages,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (totalPages <= 1) return null;

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "page") continue;
      const v = Array.isArray(value) ? value[0] : value;
      if (v) params.set(key, v);
    }
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return `/cake-catalogue${qs ? `?${qs}` : ""}`;
  };

  // Compute visible page range (show at most 5 pages)
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <nav
      aria-label="Catalogue pagination"
      className="flex items-center justify-center gap-2 py-10"
    >
      {/* Prev */}
      {currentPage > 1 ? (
        <Link
          href={buildPageHref(currentPage - 1)}
          id="catalogue-prev-page"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-deep-plum/20 text-deep-plum text-sm font-label-bold hover:bg-deep-plum hover:text-white hover:border-deep-plum transition-all duration-200"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/50 border border-deep-plum/10 text-on-surface-variant text-sm font-label-bold cursor-default">
          <ChevronLeft className="w-4 h-4" />
          Prev
        </span>
      )}

      {/* Page numbers */}
      <div className="flex items-center gap-1">
        {start > 1 && (
          <>
            <Link href={buildPageHref(1)} className="px-3 py-1.5 rounded-full text-sm bg-white border border-deep-plum/20 text-deep-plum hover:bg-deep-plum hover:text-white transition-all duration-200">
              1
            </Link>
            {start > 2 && <span className="text-on-surface-variant px-1">…</span>}
          </>
        )}
        {pages.map((p) => (
          <Link
            key={p}
            href={buildPageHref(p)}
            id={`catalogue-page-${p}`}
            className={`px-3 py-1.5 rounded-full text-sm font-label-bold transition-all duration-200 ${
              p === currentPage
                ? "bg-deep-plum text-white border border-deep-plum shadow"
                : "bg-white border border-deep-plum/20 text-deep-plum hover:bg-deep-plum hover:text-white"
            }`}
          >
            {p}
          </Link>
        ))}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="text-on-surface-variant px-1">…</span>}
            <Link href={buildPageHref(totalPages)} className="px-3 py-1.5 rounded-full text-sm bg-white border border-deep-plum/20 text-deep-plum hover:bg-deep-plum hover:text-white transition-all duration-200">
              {totalPages}
            </Link>
          </>
        )}
      </div>

      {/* Next */}
      {currentPage < totalPages ? (
        <Link
          href={buildPageHref(currentPage + 1)}
          id="catalogue-next-page"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-deep-plum text-white border border-deep-plum text-sm font-label-bold hover:bg-vibrant-magenta hover:border-vibrant-magenta transition-all duration-200"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/50 border border-deep-plum/10 text-on-surface-variant text-sm font-label-bold cursor-default">
          Next
          <ChevronRight className="w-4 h-4" />
        </span>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center space-y-5">
      <div className="w-20 h-20 rounded-full bg-deep-plum/10 flex items-center justify-center">
        <span className="material-symbols-outlined text-deep-plum/30 !text-[48px]">
          cake
        </span>
      </div>
      <div className="space-y-2">
        <p className="font-headline-md text-xl text-deep-plum/70">
          {hasFilters ? "No cakes match your filters" : "No cakes available yet"}
        </p>
        <p className="text-on-surface-variant text-sm max-w-xs mx-auto">
          {hasFilters
            ? "Try removing some filters to see more of our artisan collection."
            : "Your bakery's collection is being curated. Check back soon."}
        </p>
      </div>
      {hasFilters && (
        <Link
          href="/cake-catalogue"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-deep-plum text-white text-xs font-label-bold uppercase tracking-widest hover:bg-vibrant-magenta transition-colors duration-200"
        >
          Clear All Filters
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function CatalogueGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-xl border border-outline-variant/40 bg-white"
        >
          <div className="aspect-[5/4] bg-lavender-bg" />
          <div className="space-y-2 p-2.5 sm:p-3">
            <div className="h-3 w-3/4 rounded bg-deep-plum/10" />
            <div className="flex items-center justify-between pt-1">
              <div className="h-4 w-12 rounded bg-deep-plum/10" />
              <div className="h-8 w-14 rounded-full bg-deep-plum/10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main RSC
// ---------------------------------------------------------------------------

export default async function CatalogueGrid({
  searchParams,
}: CatalogueGridProps) {
  // ── Parse URL params ─────────────────────────────────────────────────────

  const sortRaw = getParam(searchParams, "sort") ?? "created_at";
  const sort = [
    "price_asc",
    "price_desc",
    "title_asc",
    "created_at",
  ].includes(sortRaw)
    ? (sortRaw as SortKey)
    : "created_at";

  const catHandles = parseListParam(getParam(searchParams, "cats"));
  const minPrice = Number(getParam(searchParams, "minPrice") ?? 0);
  const maxPrice = Number(getParam(searchParams, "maxPrice") ?? 0);
  const activeFlavour = normalizeFlavourParam(
    getParam(searchParams, "flavour") ?? getParam(searchParams, "flavor")
  );
  const searchQuery = (getParam(searchParams, "q") ?? "").trim();
  const currentPage = Math.max(1, Number(getParam(searchParams, "page") ?? 1));

  const hasFilters =
    catHandles.length > 0 ||
    minPrice > 0 ||
    maxPrice > 0 ||
    !!activeFlavour ||
    !!searchQuery;

  // ── Build Medusa filters ─────────────────────────────────────────────────

  const filters: CatalogueFilters = {
    sort,
    ...(catHandles.length && { categories: catHandles }),
    ...(searchQuery && { q: searchQuery }),
    ...(activeFlavour && { flavour: activeFlavour }),
    ...(minPrice > 0 && { minPrice }),
    ...(maxPrice > 0 && { maxPrice }),
  };

  const offset = (currentPage - 1) * PAGE_SIZE;
  const { products: pageProducts, count: totalCount } =
    await fetchCatalogueProducts(PAGE_SIZE, offset, filters);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  return (
    <section aria-label="Cake catalogue" className="space-y-2">
      {pageProducts.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <>
          {/* Product grid */}
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] p-4 md:p-6 lg:p-8">
            {pageProducts.map((product) => (
              <CakeCard key={product.id} product={product} />
            ))}
          </div>

          {/* Pagination */}
          <PaginationControls
            currentPage={safePage}
            totalPages={totalPages}
            searchParams={searchParams}
          />
        </>
      )}
    </section>
  );
}
