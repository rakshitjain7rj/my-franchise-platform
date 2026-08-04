"use client";

/**
 * Header search — global typeahead into cakes.
 * Shown everywhere except cake catalogue (parent Header hides it there;
 * the catalogue page has its own live search field).
 *
 * Layout:
 * - alwaysField (mobile drawer): full text field
 * - xl+: full text field in the header bar
 * - below xl: icon button → overlay field (does not reflow neighbors)
 *
 * As you type (debounced) → product suggestion dropdown.
 * Enter / “See all” → /cake-catalogue?q=…
 * Empty submit / search icon → /cake-catalogue?focus=search
 */

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cake, Loader2, Search, X } from "lucide-react";
import {
  fetchSearchSuggestions,
  isSearchableQuery,
  shouldApplySearchResults,
  type SearchHit,
} from "@/lib/data/search-suggest";

const DEBOUNCE_MS = 300;
const SUGGEST_LIMIT = 6;
/** Tailwind `xl` — full search bar; below this, icon → overlay. */
const XL_MQ = `(min-width: 1280px)`;
const OVERLAY_FIELD_WIDTH = 320;

function subscribeXl(onChange: () => void) {
  const mq = window.matchMedia(XL_MQ);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getXlSnapshot() {
  return window.matchMedia(XL_MQ).matches;
}

/** SSR / first paint: assume roomy desktop so we don't flash icon → field. */
function getXlServerSnapshot() {
  return true;
}

function catalogueSearchHref(query: string): string {
  const q = query.trim();
  if (q) {
    return `/cake-catalogue?q=${encodeURIComponent(q)}`;
  }
  return "/cake-catalogue?focus=search";
}

type PanelPos = { top: number; left: number; width: number };

type HeaderSearchProps = {
  className?: string;
  onNavigate?: () => void;
  /**
   * Always show the text field (mobile drawer).
   * Default: field at xl+, icon → overlay field below xl.
   */
  alwaysField?: boolean;
};

export default function HeaderSearch({
  className = "",
  onNavigate,
  alwaysField = false,
}: HeaderSearchProps) {
  const router = useRouter();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Latest trimmed query — used to ignore stale responses after await. */
  const latestQueryRef = useRef("");

  const [value, setValue] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  /** -1 = none, 0..hits-1 = product, hits.length = "see all" footer */
  const [activeIndex, setActiveIndex] = useState(-1);
  /** True after at least one completed fetch for the current open session */
  const [hasFetched, setHasFetched] = useState(false);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const [overlayPos, setOverlayPos] = useState<PanelPos | null>(null);
  /** Icon mode only: floating field open */
  const [expanded, setExpanded] = useState(false);
  const isXl = useSyncExternalStore(
    subscribeXl,
    getXlSnapshot,
    getXlServerSnapshot
  );
  /** Full field chrome at xl+, or forced (mobile drawer). */
  const showFieldChrome = alwaysField || isXl;

  // Collapse overlay when crossing into xl field mode
  useEffect(() => {
    if (showFieldChrome) setExpanded(false);
  }, [showFieldChrome]);

  const goCatalogue = useCallback(
    (query: string) => {
      onNavigate?.();
      setOpen(false);
      setExpanded(false);
      router.push(catalogueSearchHref(query));
    },
    [onNavigate, router]
  );

  const goProduct = useCallback(
    (handle: string) => {
      onNavigate?.();
      setOpen(false);
      setExpanded(false);
      router.push(`/products/${encodeURIComponent(handle)}`);
    },
    [onNavigate, router]
  );

  const updateOverlayPos = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(OVERLAY_FIELD_WIDTH, window.innerWidth - 16);
    let left = rect.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - width);
    }
    setOverlayPos({
      top: rect.bottom + 8,
      left,
      width,
    });
  }, []);

  const updatePanelPos = useCallback(() => {
    // Anchor suggestions to the visible field: overlay when expanded in icon mode,
    // otherwise the inline field root.
    const anchor =
      !showFieldChrome && expanded && overlayRef.current
        ? overlayRef.current
        : rootRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const minWidth = Math.max(rect.width, 288);
    let left = rect.right - minWidth;
    if (left < 8) left = 8;
    if (left + minWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - minWidth);
    }
    setPanelPos({
      top: rect.bottom + 6,
      left,
      width: Math.min(minWidth, window.innerWidth - 16),
    });
  }, [showFieldChrome, expanded]);

  // Debounced suggestions — abort previous work on every value change / unmount
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    latestQueryRef.current = trimmed;

    if (!isSearchableQuery(trimmed)) {
      abortRef.current?.abort();
      abortRef.current = null;
      setHits([]);
      setCount(0);
      setLoading(false);
      setHasFetched(false);
      setActiveIndex(-1);
      if (!trimmed) setOpen(false);
      return;
    }

    setLoading(true);
    setOpen(true);

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestQuery = trimmed;

      try {
        const data = await fetchSearchSuggestions(requestQuery, {
          limit: SUGGEST_LIMIT,
          signal: controller.signal,
        });
        if (
          !shouldApplySearchResults({
            aborted: controller.signal.aborted,
            requestQuery,
            latestQuery: latestQueryRef.current,
          })
        ) {
          return;
        }
        setHits(data.products);
        setCount(data.count);
        setHasFetched(true);
        setActiveIndex(-1);
        setOpen(true);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (
          !shouldApplySearchResults({
            aborted: controller.signal.aborted,
            requestQuery,
            latestQuery: latestQueryRef.current,
          })
        ) {
          return;
        }
        setHits([]);
        setCount(0);
        setHasFetched(true);
      } finally {
        if (
          !controller.signal.aborted &&
          requestQuery === latestQueryRef.current
        ) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [value]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const showPanel =
    open && isSearchableQuery(value) && (loading || hasFetched);

  // Position overlay field when icon mode is expanded
  useLayoutEffect(() => {
    if (showFieldChrome || !expanded) {
      setOverlayPos(null);
      return;
    }
    updateOverlayPos();
    const onReposition = () => updateOverlayPos();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [showFieldChrome, expanded, updateOverlayPos]);

  // Focus input when overlay opens
  useEffect(() => {
    if (!showFieldChrome && expanded) {
      // rAF so the fixed overlay is in the DOM first
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [showFieldChrome, expanded]);

  useLayoutEffect(() => {
    if (!showPanel) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
    const onReposition = () => updatePanelPos();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [showPanel, updatePanelPos, hits.length, loading, expanded]);

  // Click outside closes suggestion panel and icon overlay
  useEffect(() => {
    if (!open && !expanded) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      if (overlayRef.current?.contains(target)) return;
      setOpen(false);
      setActiveIndex(-1);
      setExpanded(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, expanded]);

  const footerIndex = hits.length;
  const maxIndex = hits.length;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (open && activeIndex >= 0 && activeIndex < hits.length) {
      goProduct(hits[activeIndex].handle);
      return;
    }
    goCatalogue(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      if (!showFieldChrome) {
        setExpanded(false);
      }
      return;
    }

    const panelOpen = open && isSearchableQuery(value);
    if (!panelOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      if (isSearchableQuery(value)) {
        setOpen(true);
      }
      return;
    }
    if (!panelOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i < maxIndex ? i + 1 : 0));
      setOpen(true);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? maxIndex : i - 1));
      setOpen(true);
      return;
    }
  };

  const activeOptionId =
    activeIndex >= 0 && activeIndex < hits.length
      ? `${listboxId}-opt-${activeIndex}`
      : activeIndex === footerIndex
        ? `${listboxId}-see-all`
        : undefined;

  const renderField = (opts: {
    className?: string;
    autoFocus?: boolean;
  } = {}) => (
    <form
      role="search"
      onSubmit={onSubmit}
      className={`flex w-full items-center ${opts.className ?? ""}`}
      aria-label="Search cakes"
    >
      <div className="relative flex w-full items-center">
        <button
          type="submit"
          className="absolute left-2.5 z-[1] flex h-8 w-8 items-center justify-center rounded-full text-purple-600 hover:bg-purple-50 hover:text-purple-900 transition-colors"
          aria-label={
            value.trim()
              ? `Search for ${value.trim()}`
              : "Open cake catalogue search"
          }
          title="Search cakes"
        >
          {loading ? (
            <Loader2
              className="h-4 w-4 md:h-[18px] md:w-[18px] animate-spin text-vibrant-magenta"
              strokeWidth={2.25}
            />
          ) : (
            <Search
              className="h-4 w-4 md:h-[18px] md:w-[18px]"
              strokeWidth={2.25}
            />
          )}
        </button>
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (isSearchableQuery(e.target.value)) setOpen(true);
          }}
          onFocus={() => {
            if (isSearchableQuery(value) && (hasFetched || loading)) {
              setOpen(true);
            }
          }}
          onKeyDown={onKeyDown}
          placeholder="Search cakes…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          autoFocus={opts.autoFocus}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-haspopup="listbox"
          className="h-10 w-full min-w-0 whitespace-nowrap rounded-full border border-purple-100 bg-purple-50/40 pl-11 pr-9 text-sm font-medium text-purple-950 placeholder:text-purple-400/80 transition-all focus:border-purple-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200/60 xl:w-56 2xl:w-64 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              setHits([]);
              setCount(0);
              setOpen(false);
              setActiveIndex(-1);
              setHasFetched(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2 z-[1] flex h-7 w-7 items-center justify-center rounded-full text-purple-400 transition-colors hover:bg-purple-50 hover:text-purple-800"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        )}
      </div>
    </form>
  );

  const suggestionsPanel =
    showPanel && panelPos ? (
      <div
        ref={panelRef}
        id={listboxId}
        role="listbox"
        aria-label="Cake suggestions"
        style={{
          position: "fixed",
          top: panelPos.top,
          left: panelPos.left,
          width: panelPos.width,
        }}
        className="z-[80] overflow-hidden rounded-2xl border border-purple-100/90 bg-white/98 shadow-[0_16px_40px_-12px_rgba(74,21,75,0.22)] backdrop-blur-xl"
      >
        {loading && hits.length === 0 && (
          <div className="space-y-2 p-3" aria-busy="true" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-3 rounded-xl px-2 py-1.5"
              >
                <div className="h-11 w-11 shrink-0 rounded-lg bg-purple-100/80" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 max-w-[10rem] rounded bg-purple-100/80 w-[75%]" />
                  <div className="h-2.5 w-12 rounded bg-purple-50" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && hasFetched && hits.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm font-semibold text-purple-950">
              No cakes match “{value.trim()}”
            </p>
            <p className="mt-1 text-xs text-purple-500">
              Try another name or browse the full catalogue.
            </p>
            <button
              type="button"
              id={`${listboxId}-see-all`}
              role="option"
              aria-selected={activeIndex === footerIndex}
              onMouseEnter={() => setActiveIndex(footerIndex)}
              onClick={() => goCatalogue(value)}
              className={`mt-3 inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                activeIndex === footerIndex
                  ? "bg-deep-plum text-white"
                  : "bg-purple-50 text-purple-800 hover:bg-purple-100"
              }`}
            >
              Browse catalogue
            </button>
          </div>
        )}

        {hits.length > 0 && (
          <ul className="max-h-[min(60vh,20rem)] overflow-y-auto overscroll-contain py-1.5">
            {hits.map((hit, index) => {
              const active = index === activeIndex;
              return (
                <li key={hit.id} role="presentation">
                  <Link
                    id={`${listboxId}-opt-${index}`}
                    role="option"
                    aria-selected={active}
                    href={`/products/${encodeURIComponent(hit.handle)}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onNavigate?.();
                      setOpen(false);
                      setExpanded(false);
                    }}

                    className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                      active
                        ? "bg-purple-50 text-purple-950"
                        : "text-purple-900 hover:bg-purple-50/70"
                    }`}
                  >
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 ring-1 ring-purple-100/80">
                      {hit.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote Medusa/CDN URLs; matches CakeCard
                        <img
                          src={hit.thumbnail}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-purple-300">
                          <Cake className="h-5 w-5" strokeWidth={1.75} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-snug">
                        {hit.title}
                      </p>
                      {hit.price && (
                        <p className="mt-0.5 text-xs font-medium tabular-nums text-purple-600">
                          {hit.price}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {hits.length > 0 && (
          <div className="border-t border-purple-50 p-1.5">
            <button
              type="button"
              id={`${listboxId}-see-all`}
              role="option"
              aria-selected={activeIndex === footerIndex}
              onMouseEnter={() => setActiveIndex(footerIndex)}
              onClick={() => goCatalogue(value)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${
                activeIndex === footerIndex
                  ? "bg-deep-plum text-white"
                  : "text-vibrant-magenta hover:bg-purple-50"
              }`}
            >
              <span className="truncate">
                See all results for “{value.trim()}”
                {count > hits.length ? ` (${count})` : ""}
              </span>
              <span aria-hidden className="ml-2 shrink-0">
                →
              </span>
            </button>
          </div>
        )}

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {hasFetched && !loading
            ? hits.length === 0
              ? `No cakes match ${value.trim()}`
              : `${count} cake${count === 1 ? "" : "s"} found`
            : null}
        </div>
      </div>
    ) : null;

  // Icon mode: collapsed trigger + optional fixed overlay field
  if (!showFieldChrome) {
    return (
      <div ref={rootRef} className={`relative flex items-center ${className}`}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`relative p-2.5 rounded-full transition-all duration-300 ${
            expanded
              ? "bg-purple-100 text-purple-900"
              : "text-purple-700 hover:text-purple-900 hover:bg-purple-50"
          }`}
          aria-label="Search cakes"
          aria-expanded={expanded}
          title="Search cakes"
        >
          {loading && expanded ? (
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.25} />
          ) : (
            <Search className="h-5 w-5" strokeWidth={2.25} />
          )}
        </button>

        {expanded && overlayPos && (
          <div
            ref={overlayRef}
            style={{
              position: "fixed",
              top: overlayPos.top,
              left: overlayPos.left,
              width: overlayPos.width,
            }}
            className="z-[79] rounded-2xl border border-purple-100/90 bg-white/98 p-2 shadow-[0_16px_40px_-12px_rgba(74,21,75,0.22)] backdrop-blur-xl"
          >
            {renderField()}
          </div>
        )}

        {suggestionsPanel}
      </div>
    );
  }

  // Full field (xl+ header or mobile drawer)
  return (
    <div ref={rootRef} className={`relative flex items-center ${className}`}>
      {renderField()}
      {suggestionsPanel}
    </div>
  );
}
