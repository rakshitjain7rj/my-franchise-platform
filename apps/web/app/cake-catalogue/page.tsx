/**
 * /app/cake-catalogue/page.tsx — Dynamic Franchise-Scoped Cake Catalogue
 *
 * Architecture
 * ────────────
 * • `export const dynamic = "force-dynamic"` — every request is server-rendered
 *   so the correct franchise catalog is served per the `franchise_id` cookie.
 *
 * • No franchise guard needed here. The Next.js Middleware (middleware.ts)
 *   intercepts every request at the edge, checks for the `franchise_id`
 *   cookie, and redirects unauthenticated users to /map-routing before
 *   this page ever renders. This page can safely assume the cookie exists.
 *
 * • Filter state lives entirely in URL search params. The client-side
 *   `CatalogueFilters` component writes params via `router.replace()`; this
 *   page's RSC reads them from `searchParams` and fires a fresh Medusa fetch.
 *   Shareable, bookmarkable, back-button-safe URLs with zero client product state.
 *
 * • `<Suspense>` streaming — Header renders instantly; content streams in.
 *
 * Data flow per request
 * ──────────────────────
 *  searchParams      → CatalogueContent
 *  CatalogueContent  → fetchCatalogueCategories()
 *                    → products: always server-paginated via Medusa
 *                      (cats / q / sponge / price — all backend)
 *                    → CatalogueFilters + sidebar + grid + pagination
 */

import { Suspense } from "react";
import Link from "next/link";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { CatalogueGridSkeleton } from "@/modules/catalogue/components/catalogue-grid";
import CatalogueFilters, {
  CatalogueCategorySidebar,
  CatalogueToolbar,
} from "@/modules/catalogue/components/catalogue-filters";
import CakeCard from "@/modules/catalogue/components/cake-card";
import {
  fetchCatalogueProducts,
  fetchCatalogueCategories,
  normalizeFlavourParam,
  type CatalogueFilters as FiltersType,
  type SortKey,
} from "@/lib/data/catalogue";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

// ─── Force dynamic rendering ─────────────────────────────────────────────────
export const dynamic = "force-dynamic";

// ─── Page metadata ────────────────────────────────────────────────────────────
export const metadata = {
  title: "Cake Catalogue | Cake Break – Artisan Bakes Near You",
  description:
    "Browse our full artisan cake collection curated exclusively for your nearest Cake Break bakery. Filter by flavour, category, and price.",
};

// ─── Pagination & Filtering Constants / Helpers ───────────────────────────────
const PAGE_SIZE = 24;

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

function EmptyState({
  hasFilters,
  searchQuery,
}: {
  hasFilters: boolean;
  searchQuery?: string;
}) {
  const isSearch = Boolean(searchQuery?.trim());
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/50 bg-gradient-to-b from-white to-lavender-bg/40 px-6 py-14 text-center shadow-[0_4px_24px_-12px_rgba(74,21,75,0.08)]">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-lavender-bg shadow-inner">
        <span className="material-symbols-outlined text-deep-plum/40 !text-[28px]">
          {isSearch ? "search_off" : "cake"}
        </span>
      </div>
      <p className="text-base font-extrabold tracking-tight text-deep-plum">
        {isSearch
          ? `No cakes match “${searchQuery!.trim()}”`
          : hasFilters
            ? "No cakes match your filters"
            : "No cakes available yet"}
      </p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-on-surface-variant">
        {isSearch
          ? "Try a shorter word, a product code (e.g. R1), or a flavour like chocolate or wedding."
          : hasFilters
            ? "Try clearing filters or searching for a different cake name."
            : "Your bakery’s collection is being curated. Check back soon."}
      </p>
      {(hasFilters || isSearch) && (
        <Link
          href="/cake-catalogue"
          className="mt-5 inline-flex items-center rounded-full bg-deep-plum px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-[0_6px_16px_-4px_rgba(74,21,75,0.35)] transition-colors hover:bg-vibrant-magenta"
        >
          Browse all cakes
        </Link>
      )}
    </div>
  );
}

function CatalogueShellSkeleton() {
  return (
    <div>
      <div className="border-b border-outline-variant/40 bg-white">
        <div className="mx-auto flex max-w-[1400px] animate-pulse items-center gap-4 px-3 py-2.5 sm:px-4 md:px-6 lg:px-8">
          <div className="h-5 w-32 rounded bg-deep-plum/10" />
          <div className="h-9 max-w-md flex-1 rounded-full bg-deep-plum/5" />
        </div>
      </div>
      <div className="mx-auto flex max-w-[1400px] gap-4 px-3 py-3 sm:px-4 md:px-6 lg:px-8">
        <div className="hidden h-80 w-52 shrink-0 animate-pulse rounded-xl bg-white lg:block" />
        <div className="min-w-0 flex-1">
          <CatalogueGridSkeleton />
        </div>
      </div>
    </div>
  );
}

// ─── Content Component (Asynchronously fetches and renders list/pagination) ───
async function CatalogueContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // Parse parameters
  const sortRaw = getParam(searchParams, "sort") ?? "created_at";
  const sort = ["price_asc", "price_desc", "title_asc", "created_at"].includes(
    sortRaw
  )
    ? (sortRaw as SortKey)
    : "created_at";

  const catHandles = parseListParam(getParam(searchParams, "cats"));
  const minPrice = Number(getParam(searchParams, "minPrice") ?? 0);
  const maxPrice = Number(getParam(searchParams, "maxPrice") ?? 0);
  // Accept both spellings — home "Curated by Flavor" used `flavor=`
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

  const filters: FiltersType = {
    sort,
    ...(catHandles.length && { categories: catHandles }),
    ...(searchQuery && { q: searchQuery }),
    ...(activeFlavour && { flavour: activeFlavour }),
    ...(minPrice > 0 && { minPrice }),
    ...(maxPrice > 0 && { maxPrice }),
  };

  const categories = await fetchCatalogueCategories();

  // All filters (incl. sponge + price) are applied server-side; Medusa paginates.
  const offset = (currentPage - 1) * PAGE_SIZE;
  const { products: pageProducts, count: totalCount } =
    await fetchCatalogueProducts(PAGE_SIZE, offset, filters);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

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
  const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const activeCategoryName =
    categories.find((c) => catHandles.includes(c.handle))?.name ?? null;

  return (
    <div>
      <CatalogueFilters
        availableCategories={categories}
        totalCount={totalCount}
      />

      <div className="mx-auto max-w-[1400px] px-3 py-3 sm:px-4 md:px-6 lg:px-8 lg:py-4">
        <div className="flex gap-4 lg:gap-6">
          <CatalogueCategorySidebar
            availableCategories={categories}
            totalCount={totalCount}
          />

          <section aria-label="Cake catalogue" className="min-w-0 flex-1 space-y-3">
            <CatalogueToolbar
              totalCount={totalCount}
              activeCategoryName={activeCategoryName}
            />

            {pageProducts.length === 0 ? (
              <EmptyState hasFilters={hasFilters} searchQuery={searchQuery} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {pageProducts.map((product) => (
                    <CakeCard key={product.id} product={product} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex flex-col items-center gap-2 border-t border-outline-variant/40 pt-4 pb-2">
                    <p className="text-xs text-on-surface-variant">
                      Page{" "}
                      <span className="font-semibold text-deep-plum">
                        {safePage}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-deep-plum">
                        {totalPages}
                      </span>
                    </p>
                    <Pagination>
                      <PaginationContent className="gap-1">
                        <PaginationItem>
                          {safePage > 1 ? (
                            <PaginationPrevious
                              href={buildPageHref(safePage - 1)}
                            />
                          ) : (
                            <span className="pointer-events-none opacity-40">
                              <PaginationPrevious href="#" />
                            </span>
                          )}
                        </PaginationItem>

                        {start > 1 && (
                          <>
                            <PaginationItem>
                              <PaginationLink href={buildPageHref(1)}>
                                1
                              </PaginationLink>
                            </PaginationItem>
                            {start > 2 && (
                              <PaginationItem>
                                <PaginationEllipsis />
                              </PaginationItem>
                            )}
                          </>
                        )}

                        {pages.map((pageNum) => (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              href={buildPageHref(pageNum)}
                              isActive={safePage === pageNum}
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        ))}

                        {end < totalPages && (
                          <>
                            {end < totalPages - 1 && (
                              <PaginationItem>
                                <PaginationEllipsis />
                              </PaginationItem>
                            )}
                            <PaginationItem>
                              <PaginationLink href={buildPageHref(totalPages)}>
                                {totalPages}
                              </PaginationLink>
                            </PaginationItem>
                          </>
                        )}

                        <PaginationItem>
                          {safePage < totalPages ? (
                            <PaginationNext href={buildPageHref(safePage + 1)} />
                          ) : (
                            <span className="pointer-events-none opacity-40">
                              <PaginationNext href="#" />
                            </span>
                          )}
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface CakeCataloguePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function CakeCataloguePage({
  searchParams,
}: CakeCataloguePageProps) {
  // Await the searchParams promise (Next.js 15 async searchParams)
  const resolvedParams = await searchParams;
  const CatalogueContentComponent = CatalogueContent as any;

  return (
    <div className="min-h-screen bg-[#FAF7FC]">
      <Header />

      <main className="pb-16 md:pb-0">
        <Suspense fallback={<CatalogueShellSkeleton />}>
          <CatalogueContentComponent searchParams={resolvedParams} />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}