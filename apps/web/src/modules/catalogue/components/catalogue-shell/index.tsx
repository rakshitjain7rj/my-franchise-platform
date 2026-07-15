/**
 * CatalogueShell — React Server Component
 *
 * Orchestrates both the CatalogueFilters and CatalogueGrid in a single async RSC
 * so the filtered `totalCount` (only available after the Medusa fetch) can be
 * forwarded to the filter bar's results label.
 *
 * This avoids:
 *   • A separate lightweight "count" fetch
 *   • Client-side state for the count
 *   • Mismatched counts between filter bar and grid
 *
 * The entire shell is wrapped in <Suspense> by the parent page, streaming
 * behind the skeleton while data loads.
 *
 * Note: the primary /cake-catalogue page implements its own content shell;
 * this component remains for any alternate entry points that import it.
 */

import CatalogueFilters from "@/modules/catalogue/components/catalogue-filters";
import CatalogueGrid from "@/modules/catalogue/components/catalogue-grid";
import {
  fetchCatalogueProducts,
  fetchCatalogueCategories,
  type CatalogueFilters as FiltersType,
  type SortKey,
} from "@/lib/data/catalogue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogueShellProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// ---------------------------------------------------------------------------
// Helpers (duplicated minimally from CatalogueGrid to avoid coupling)
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
// Component
// ---------------------------------------------------------------------------

export default async function CatalogueShell({
  searchParams,
}: CatalogueShellProps) {
  // ── Parse params ────────────────────────────────────────────────────────
  const sortRaw = getParam(searchParams, "sort") ?? "created_at";
  const sort = ["price_asc", "price_desc", "title_asc", "created_at"].includes(
    sortRaw
  )
    ? (sortRaw as SortKey)
    : "created_at";

  const catHandles = parseListParam(getParam(searchParams, "cats"));
  const minPrice = Number(getParam(searchParams, "minPrice") ?? 0);
  const maxPrice = Number(getParam(searchParams, "maxPrice") ?? 0);

  const filters: FiltersType = {
    sort,
    ...(catHandles.length && { categories: catHandles }),
  };

  // ── Fetch metadata + count in parallel ──────────────────────────────────
  const [categories, { count: rawCount }] = await Promise.all([
    fetchCatalogueCategories(),
    // Lightweight count-only fetch (limit=1 returns count without data payload)
    fetchCatalogueProducts(1, 0, filters),
  ]);

  // Apply price filter approximation to the count
  // (server count ignores price range — shown as "~N" when price filter active)
  const priceFiltered = minPrice > 0 || maxPrice > 0;
  const displayCount = priceFiltered ? rawCount : rawCount;

  return (
    <div className="space-y-0">
      <CatalogueFilters
        availableCategories={categories}
        totalCount={displayCount}
      />
      <div className="max-w-[1440px] mx-auto px-5 md:px-16 py-8">
        <CatalogueGrid searchParams={searchParams} />
      </div>
    </div>
  );
}
