"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Search,
  X,
  SlidersHorizontal,
  RotateCcw,
} from "lucide-react";
import {
  FLAVOUR_OPTIONS,
  type CatalogueCategory,
  type SortKey,
} from "@/lib/data/catalogue";
import { PremiumSelect } from "@/components/ui/premium-select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogueFiltersProps {
  availableCategories: CatalogueCategory[];
  totalCount: number;
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "created_at", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "title_asc", label: "Name: A–Z" },
];

const PRICE_PRESETS = [
  { value: "", label: "Any price" },
  { value: "0-25", label: "Under £25" },
  { value: "25-40", label: "£25 – £40" },
  { value: "40-60", label: "£40 – £60" },
  { value: "60-100", label: "£60 – £100" },
  { value: "100-0", label: "£100+" },
];

const SHAPE_HANDLES = [
  "round-cakes",
  "square-cakes",
  "tall-cakes",
  "heart-cake",
  "icing-cakes",
  "novelty-kids-cakes",
  "number-cakes",
  "tiered-cakes",
  "tray-cakes",
  "doll-cakes",
];

const OCCASION_HANDLES = [
  "wedding-cakes",
  "baby-shower-cakes",
  "graduation-cakes",
  "click-and-collect",
  "umrah-and-hajj-mubarak-cake",
];

const SEASONAL_HANDLES = [
  "christmas",
  "diwali-cakes",
  "easter",
  "eid-cakes",
  "valentines",
  "mothers-day-cakes",
  "fathers-day-cakes",
  "lohri-cakes",
  "vaisakhi-cakes",
  "raksha-bandhan",
];

function groupCategories(cats: CatalogueCategory[]) {
  const byHandle = new Map(cats.map((c) => [c.handle, c]));
  const pick = (handles: string[]) =>
    handles.map((h) => byHandle.get(h)).filter(Boolean) as CatalogueCategory[];

  const shape = pick(SHAPE_HANDLES);
  const occasion = pick(OCCASION_HANDLES);
  const seasonal = pick(SEASONAL_HANDLES);
  const known = new Set([
    ...SHAPE_HANDLES,
    ...OCCASION_HANDLES,
    ...SEASONAL_HANDLES,
  ]);
  const other = cats.filter((c) => !known.has(c.handle));

  return [
    { title: "By shape & style", items: shape },
    { title: "By occasion", items: occasion },
    { title: "Seasonal", items: seasonal },
    ...(other.length ? [{ title: "More", items: other }] : []),
  ].filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function useCatalogueParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      // Drop legacy flavour spelling when writing canonical key
      if ("flavour" in updates) params.delete("flavor");
      for (const [key, value] of Object.entries(updates)) {
        if (value === "" || value == null) params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [searchParams, pathname, router]
  );

  const clearAll = useCallback(() => {
    startTransition(() => router.replace(pathname, { scroll: false }));
  }, [pathname, router]);

  return {
    searchParams,
    isPending,
    updateParams,
    clearAll,
    startTransition,
    pathname,
    router,
  };
}

function FilterControls({
  currentFlavour,
  currentPricePreset,
  currentSort,
  hasActiveFilters,
  updateParams,
  onPriceChange,
  clearAll,
}: {
  currentFlavour: string;
  currentPricePreset: string;
  currentSort: string;
  hasActiveFilters: boolean;
  updateParams: (u: Record<string, string>) => void;
  onPriceChange: (preset: string) => void;
  clearAll: () => void;
}) {
  const flavourOptions = useMemo(
    () => [
      { value: "", label: "Any sponge" },
      ...FLAVOUR_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    ],
    []
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PremiumSelect
        label="Sponge flavour"
        value={currentFlavour}
        placeholder="Sponge"
        options={flavourOptions}
        active={!!currentFlavour}
        onChange={(v) => updateParams({ flavour: v })}
      />

      <PremiumSelect
        label="Price range"
        value={currentPricePreset}
        placeholder="Price"
        options={PRICE_PRESETS}
        active={!!currentPricePreset}
        onChange={onPriceChange}
      />

      <PremiumSelect
        label="Sort by"
        value={currentSort}
        placeholder="Sort"
        options={SORT_OPTIONS}
        onChange={(v) => updateParams({ sort: v })}
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-outline-variant/50 bg-white px-3.5 text-xs font-semibold text-deep-plum shadow-sm transition-all hover:border-vibrant-magenta/40 hover:text-vibrant-magenta"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      )}
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-fixed/80 px-3 py-1 text-xs font-semibold text-on-secondary-container shadow-sm ring-1 ring-secondary-fixed-dim/40">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="rounded-full p-0.5 transition-colors hover:bg-white/70"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function MobileChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold tracking-wide transition-all duration-200 ${
        active
          ? "bg-deep-plum text-white shadow-[0_4px_12px_-4px_rgba(74,21,75,0.45)]"
          : "bg-white text-deep-plum ring-1 ring-outline-variant/45 hover:ring-deep-plum/25"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Hero + mobile filters
// ---------------------------------------------------------------------------

export default function CatalogueFilters({
  availableCategories,
  totalCount,
}: CatalogueFiltersProps) {
  const { searchParams, isPending, updateParams, clearAll } =
    useCatalogueParams();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const currentSort = (searchParams.get("sort") ?? "created_at") as SortKey;
  const currentFlavour =
    searchParams.get("flavour") ?? searchParams.get("flavor") ?? "";
  const currentCat = searchParams.get("cats") ?? "";
  const currentQ = searchParams.get("q") ?? "";
  const minPrice = searchParams.get("minPrice") ?? "";
  const maxPrice = searchParams.get("maxPrice") ?? "";

  const currentPricePreset =
    minPrice || maxPrice ? `${minPrice || "0"}-${maxPrice || "0"}` : "";

  const [searchDraft, setSearchDraft] = useState(currentQ);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchDraft(currentQ);
  }, [currentQ]);

  // Debounced live search — skip mid-typing noise under 2 chars (except clear)
  useEffect(() => {
    if (searchDraft === currentQ) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = searchDraft.trim();
    // Don't fire a search for a single character while the user is still typing
    if (trimmed.length === 1) return;
    debounceRef.current = setTimeout(() => {
      updateParams({ q: trimmed });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchDraft, currentQ, updateParams]);

  const activeCategory = availableCategories.find(
    (c) => c.handle === currentCat
  );

  const hasActiveFilters =
    !!currentFlavour ||
    !!currentCat ||
    !!currentQ ||
    !!minPrice ||
    !!maxPrice ||
    (currentSort && currentSort !== "created_at");

  const onPriceChange = (preset: string) => {
    if (!preset) {
      updateParams({ minPrice: "", maxPrice: "" });
      return;
    }
    const [min, max] = preset.split("-");
    updateParams({
      minPrice: min === "0" ? "" : min,
      maxPrice: max === "0" ? "" : max,
    });
  };

  const handleClearAll = () => {
    setSearchDraft("");
    setMobileFiltersOpen(false);
    clearAll();
  };

  const flavourLabel =
    FLAVOUR_OPTIONS.find((f) => f.value === currentFlavour)?.label ??
    currentFlavour;

  return (
    <>
      {/* Compact catalogue bar */}
      <section className="border-b border-outline-variant/30 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2.5 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4 md:px-6 lg:px-8">
          <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 sm:justify-start">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-vibrant-magenta/90">
                Collection
              </p>
              <h1 className="truncate font-headline text-base font-extrabold tracking-tight text-deep-plum md:text-lg">
                {activeCategory ? activeCategory.name : "Cake catalogue"}
              </h1>
            </div>
            <p className="shrink-0 text-xs font-semibold tabular-nums text-on-surface-variant sm:hidden">
              {isPending ? (
                <span className="animate-pulse">…</span>
              ) : (
                <>
                  <span className="text-deep-plum">{totalCount}</span> cakes
                </>
              )}
            </p>
          </div>

          <form
            className="relative min-w-0 flex-1 sm:max-w-md lg:max-w-xl"
            onSubmit={(e) => {
              e.preventDefault();
              if (debounceRef.current) clearTimeout(debounceRef.current);
              updateParams({ q: searchDraft.trim() });
            }}
            role="search"
          >
            <div className="group relative">
              <Search
                className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${
                  isPending
                    ? "text-vibrant-magenta"
                    : "text-on-surface-variant/50 group-focus-within:text-vibrant-magenta"
                }`}
              />
              {/* type=text avoids the browser's native clear (×) which stacked
                  with our button and looked like a double cross */}
              <input
                id="catalogue-search"
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                spellCheck={false}
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search by name, code or flavour…"
                aria-label="Search cakes"
                className="h-11 w-full rounded-full border border-outline-variant/40 bg-gradient-to-b from-white to-lavender-bg/80 pl-11 pr-11 text-sm font-medium text-deep-plum shadow-[0_1px_2px_rgba(74,21,75,0.04),inset_0_1px_0_rgba(255,255,255,0.8)] placeholder:font-normal placeholder:text-on-surface-variant/45 transition-all duration-200 hover:border-deep-plum/20 focus:border-vibrant-magenta/45 focus:bg-white focus:outline-none focus:ring-4 focus:ring-vibrant-magenta/12"
              />
              {searchDraft && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchDraft("");
                    if (debounceRef.current) clearTimeout(debounceRef.current);
                    updateParams({ q: "" });
                  }}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant/70 transition-all hover:bg-lavender-bg hover:text-deep-plum active:scale-95"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
              )}
            </div>
          </form>

          {hasActiveFilters && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:ml-auto">
              {currentCat && activeCategory && (
                <FilterChip
                  label={activeCategory.name}
                  onRemove={() => updateParams({ cats: "" })}
                />
              )}
              {currentFlavour && (
                <FilterChip
                  label={flavourLabel}
                  onRemove={() => updateParams({ flavour: "" })}
                />
              )}
              {currentPricePreset && (
                <FilterChip
                  label={
                    PRICE_PRESETS.find((p) => p.value === currentPricePreset)
                      ?.label ?? "Price"
                  }
                  onRemove={() => updateParams({ minPrice: "", maxPrice: "" })}
                />
              )}
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs font-bold uppercase tracking-wider text-vibrant-magenta hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Mobile category strip + filters */}
      <div className="border-b border-outline-variant/25 bg-gradient-to-b from-white to-lavender-bg/30 lg:hidden">
        <div className="mx-auto max-w-[1400px] space-y-2.5 px-3 py-3 sm:px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
              Categories
            </p>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                mobileFiltersOpen || hasActiveFilters
                  ? "bg-deep-plum text-white shadow-md shadow-deep-plum/20"
                  : "border border-outline-variant/50 bg-white text-deep-plum shadow-sm"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {mobileFiltersOpen ? "Hide" : "Filters"}
            </button>
          </div>

          {availableCategories.length > 0 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <MobileChip
                active={!currentCat}
                onClick={() => updateParams({ cats: "" })}
                label="All"
              />
              {availableCategories.map((cat) => (
                <MobileChip
                  key={cat.id}
                  active={currentCat === cat.handle}
                  onClick={() =>
                    updateParams({
                      cats: currentCat === cat.handle ? "" : cat.handle,
                    })
                  }
                  label={cat.name.replace(/ Cakes?$/i, "")}
                />
              ))}
            </div>
          )}

          {mobileFiltersOpen && (
            <div className="rounded-2xl border border-outline-variant/35 bg-white/90 p-3 shadow-[0_8px_24px_-12px_rgba(74,21,75,0.15)] backdrop-blur-sm">
              <FilterControls
                currentFlavour={currentFlavour}
                currentPricePreset={currentPricePreset}
                currentSort={currentSort}
                hasActiveFilters={hasActiveFilters}
                updateParams={updateParams}
                onPriceChange={onPriceChange}
                clearAll={handleClearAll}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop sidebar + toolbar
// ---------------------------------------------------------------------------

export function CatalogueCategorySidebar({
  availableCategories,
  totalCount,
}: {
  availableCategories: CatalogueCategory[];
  totalCount: number;
}) {
  const { searchParams, updateParams } = useCatalogueParams();
  const currentCat = searchParams.get("cats") ?? "";
  const groups = useMemo(
    () => groupCategories(availableCategories),
    [availableCategories]
  );

  return (
    <aside className="hidden w-52 shrink-0 lg:block xl:w-56">
      <div className="sticky top-20 max-h-[calc(100vh-5.5rem)] overflow-y-auto rounded-2xl border border-outline-variant/35 bg-white p-3.5 shadow-[0_4px_20px_-8px_rgba(74,21,75,0.1)]">
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-deep-plum">
            Categories
          </p>
          <span className="h-1 w-1 rounded-full bg-vibrant-magenta" />
        </div>

        <button
          type="button"
          onClick={() => updateParams({ cats: "" })}
          className={`mb-3.5 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-all duration-200 ${
            !currentCat
              ? "bg-deep-plum text-white shadow-[0_6px_16px_-4px_rgba(74,21,75,0.4)]"
              : "bg-lavender-bg/90 text-deep-plum hover:bg-lavender-bg"
          }`}
        >
          All cakes
          {!currentCat && totalCount > 0 && (
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white/85">
              {totalCount}
            </span>
          )}
        </button>

        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/75">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((cat) => {
                  const active = currentCat === cat.handle;
                  return (
                    <li key={cat.id}>
                      <button
                        type="button"
                        onClick={() =>
                          updateParams({ cats: active ? "" : cat.handle })
                        }
                        className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-all duration-150 ${
                          active
                            ? "bg-secondary-fixed font-bold text-deep-plum shadow-sm ring-1 ring-secondary-fixed-dim/50"
                            : "text-on-surface-variant hover:bg-lavender-bg hover:text-deep-plum"
                        }`}
                      >
                        {cat.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function CatalogueToolbar({
  totalCount,
  activeCategoryName,
}: {
  totalCount: number;
  activeCategoryName?: string | null;
}) {
  const { searchParams, isPending, updateParams, clearAll } =
    useCatalogueParams();

  const currentSort = (searchParams.get("sort") ?? "created_at") as SortKey;
  const currentFlavour =
    searchParams.get("flavour") ?? searchParams.get("flavor") ?? "";
  const currentQ = searchParams.get("q") ?? "";
  const minPrice = searchParams.get("minPrice") ?? "";
  const maxPrice = searchParams.get("maxPrice") ?? "";
  const currentCat = searchParams.get("cats") ?? "";

  const currentPricePreset =
    minPrice || maxPrice ? `${minPrice || "0"}-${maxPrice || "0"}` : "";

  const hasActiveFilters =
    !!currentFlavour ||
    !!currentCat ||
    !!currentQ ||
    !!minPrice ||
    !!maxPrice ||
    (currentSort && currentSort !== "created_at");

  const onPriceChange = (preset: string) => {
    if (!preset) {
      updateParams({ minPrice: "", maxPrice: "" });
      return;
    }
    const [min, max] = preset.split("-");
    updateParams({
      minPrice: min === "0" ? "" : min,
      maxPrice: max === "0" ? "" : max,
    });
  };

  return (
    <div className="hidden items-center justify-between gap-3 lg:flex">
      <p className="shrink-0 text-xs text-on-surface-variant">
        {isPending ? (
          <span className="inline-flex items-center gap-2 font-medium text-deep-plum/70">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-vibrant-magenta" />
            Updating…
          </span>
        ) : (
          <>
            <span className="font-bold tabular-nums text-deep-plum">
              {totalCount}
            </span>{" "}
            {totalCount === 1 ? "cake" : "cakes"}
            {activeCategoryName && (
              <>
                {" "}
                in{" "}
                <span className="font-semibold text-deep-plum">
                  {activeCategoryName}
                </span>
              </>
            )}
            {currentQ && (
              <>
                {" "}
                for “
                <span className="font-semibold text-deep-plum">{currentQ}</span>”
              </>
            )}
          </>
        )}
      </p>
      <FilterControls
        currentFlavour={currentFlavour}
        currentPricePreset={currentPricePreset}
        currentSort={currentSort}
        hasActiveFilters={hasActiveFilters}
        updateParams={updateParams}
        onPriceChange={onPriceChange}
        clearAll={clearAll}
      />
    </div>
  );
}
