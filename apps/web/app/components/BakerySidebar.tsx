"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { StoreLocationCard } from "../map-routing/page";
import { selectStore } from "@/lib/store-selection";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Franchise {
  /** The Medusa StoreLocation ID. */
  id: string;
  /** The parent franchise / stock-location ID. */
  franchiseId: string;
  name: string;
  locationId: string;
  hours: string;
  distance?: string;
  address: string;
}

interface BakerySidebarProps {
  /** The active Franchise (brand) ID — displayed for context, never mutated. */
  franchiseId: string;
  /** StoreLocation records under this franchise. */
  locations: StoreLocationCard[];
  /** Optionally highlight a pre-selected location (e.g. from a map click). */
  highlightedId?: string | null;
  /** Fired by the parent when the map selects a marker. */
  onHighlight?: (id: string) => void;
  /** Fired when the user selects a physical store to shop at. */
  onSelectStore?: (franchise: Franchise) => void;
  /** ID of the currently selected physical store location. */
  selectedId?: string | null;
  /** Whether the app is currently routing/navigating. */
  isNavigating?: boolean;
  /**
   * Mobile collapsed sheet: tighter header so location cards remain visible.
   * Ignored on desktop (md+).
   */
  compactMobile?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BakerySidebar({
  franchiseId,
  locations,
  highlightedId,
  onHighlight,
  onSelectStore,
  selectedId: propSelectedId,
  isNavigating: propIsNavigating,
  compactMobile = false,
}: BakerySidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const [localIsNavigating, setLocalIsNavigating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedId = propSelectedId !== undefined ? propSelectedId : localSelectedId;
  const isNavigating = propIsNavigating !== undefined ? propIsNavigating : localIsNavigating;

  // Client-side search filter
  const filteredLocations = locations.filter((loc) => {
    const q = searchQuery.toLowerCase();
    return (
      q === "" ||
      loc.name.toLowerCase().includes(q) ||
      loc.address.toLowerCase().includes(q)
    );
  });

  /**
   * When the user confirms a store location:
   *  - The `franchise_id` cookie is LEFT UNTOUCHED (catalog stays locked to the brand).
   *  - A separate `selected_store_location_id` cookie is written for fulfillment routing.
   */
  function handleSelectLocation(location: StoreLocationCard) {
    if (isNavigating) return;

    const franchiseObj: Franchise = {
      id: location.id,
      franchiseId: location.franchiseId,
      name: location.name,
      locationId: location.locationId,
      hours: location.hours,
      address: location.address,
      distance: location.distance,
    };

    if (onSelectStore) {
      onSelectStore(franchiseObj);
    } else {
      setLocalSelectedId(location.id);
      setLocalIsNavigating(true);
      // Explicit user choice — persists until they pick another bakery.
      selectStore(
        {
          storeLocationId: location.id,
          storeName: location.name,
          franchiseId: location.franchiseId,
        },
        "user-select"
      );

      // Honour the ?redirect= param set by Next.js middleware when the user
      // was redirected here from a gated page. Fall back to home.
      const redirectTo = searchParams.get("redirect") || "/";
      router.push(redirectTo);
    }
  }

  return (
    <div className="w-full md:w-[420px] h-full min-h-0 flex flex-col">
      {/*
        Glass panel: mobile keeps the map visible through a frosted sheet;
        desktop stays more solid for readability over the side column.
      */}
      <div
        className={`
          relative overflow-hidden
          flex flex-col h-full min-h-0
          border border-white/40 md:border-white/60
          premium-shadow
          bg-white/35 md:bg-white/90
          backdrop-blur-xl md:backdrop-blur-2xl
          supports-[backdrop-filter]:bg-white/30
          md:supports-[backdrop-filter]:bg-white/85
          ${compactMobile ? "rounded-2xl" : "rounded-t-2xl md:rounded-2xl"}
        `}
      >
        {/* Soft scrim so map texture doesn't fight headline text on mobile */}
        <div
          className="
            pointer-events-none absolute inset-0 md:hidden
            bg-gradient-to-b from-white/50 via-white/20 to-white/40
          "
          aria-hidden="true"
        />

        {/* Spacer for the parent drag-handle (mobile) */}
        <div className="relative shrink-0 h-8 md:hidden" aria-hidden="true" />

        {/* ── Brand header ─────────────────────────────────────────────── */}
        <div
          className={`
            relative shrink-0
            border-b border-white/30 md:border-outline-variant/20
            px-4 md:px-8
            ${compactMobile
              ? "pt-1 pb-3"
              : "pt-2 pb-4 md:pt-8 md:pb-6"
            }
          `}
        >
          {/* Logo / brand name — hide in compact mobile to free list space */}
          <div
            className={`
              items-center gap-3 mb-1
              ${compactMobile ? "hidden md:flex" : "flex"}
            `}
          >
            <div className="w-8 h-8 rounded-full bg-deep-plum flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined !text-[16px] text-white">
                cake
              </span>
            </div>
            <span className="font-headline text-[11px] font-bold uppercase tracking-[0.25em] text-deep-plum drop-shadow-sm">
              Cake Break
            </span>
          </div>

          <h1
            className={`
              font-headline font-extrabold text-deep-plum leading-tight
              [text-shadow:0_1px_2px_rgba(255,255,255,0.9),0_0_12px_rgba(255,255,255,0.55)]
              ${compactMobile
                ? "text-xl md:text-3xl mt-0"
                : "text-2xl md:text-3xl mt-2"
              }
            `}
          >
            Choose Your{" "}
            <span className="text-vibrant-magenta italic font-light">
              Bakery
            </span>
          </h1>
          <p
            className={`
              font-body text-deep-plum/80 md:text-on-surface-variant leading-relaxed
              [text-shadow:0_1px_1px_rgba(255,255,255,0.85)]
              ${compactMobile
                ? "hidden md:block text-sm mt-1"
                : "text-sm mt-1"
              }
            `}
          >
            Pick a location for delivery &amp; pickup — your catalog stays the same.
          </p>

          {/* Search input — frosted field so map peeks through edges */}
          <div className={`relative ${compactMobile ? "mt-3" : "mt-5"}`}>
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-deep-plum/55 pointer-events-none">
              <span className="material-symbols-outlined !text-[18px]">search</span>
            </span>
            <input
              id="location-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Search by area or postcode…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search bakery locations"
              className="
                w-full h-11 md:h-12 pl-11 pr-5
                bg-white/55 md:bg-lavender-bg/60
                backdrop-blur-md
                border border-white/70 md:border-outline-variant/40
                rounded-full
                text-sm text-deep-plum font-medium
                placeholder:text-deep-plum/45
                focus:border-deep-plum focus:bg-white/75 focus:ring-0 outline-none
                shadow-sm
                transition-all
              "
            />
          </div>
        </div>

        {/* ── Location card list ───────────────────────────────────────── */}
        {/* min-h-0 is required: without it flex-1 children refuse to shrink
            and overflow is clipped with no scroll on mobile Safari. */}
        <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 md:px-4 py-3 space-y-3 [-webkit-overflow-scrolling:touch]">
          {filteredLocations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 md:py-16 text-center px-6">
              <span className="material-symbols-outlined !text-[48px] text-deep-plum/35 mb-3">
                location_off
              </span>
              <p className="font-headline text-sm font-semibold text-deep-plum [text-shadow:0_1px_1px_rgba(255,255,255,0.9)]">
                No locations found
              </p>
              <p className="text-xs text-deep-plum/65 mt-1">
                Try a different postcode or area name.
              </p>
            </div>
          ) : (
            filteredLocations.map((location) => {
              const isSelected = selectedId === location.id;
              const isHighlighted = highlightedId === location.id;
              const isActive = isSelected || isHighlighted;

              return (
                <div
                  key={location.id}
                  onClick={() => {
                    if (!isNavigating) onHighlight?.(location.id);
                  }}
                  className={`
                    group relative rounded-2xl border transition-all duration-300 cursor-pointer
                    backdrop-blur-md
                    ${
                      isActive
                        ? "bg-deep-plum/95 border-deep-plum text-white shadow-[0_8px_32px_-8px_rgba(74,21,75,0.45)]"
                        : "bg-white/70 md:bg-white/60 border-white/80 md:border-outline-variant/30 hover:border-deep-plum/30 hover:bg-white/85 hover:premium-shadow"
                    }
                  `}
                >
                  {/* Selected indicator strip */}
                  {isActive && (
                    <div className="absolute left-0 top-4 bottom-4 w-0.5 bg-vibrant-magenta rounded-r-full" />
                  )}

                  <div className="px-4 py-3.5 md:px-5 md:py-4">
                    {/* Top row: name + selected badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {isActive && (
                            <span className="inline-flex items-center gap-1 bg-vibrant-magenta/20 text-vibrant-magenta px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest">
                              <span className="material-symbols-outlined !text-[10px]">
                                check_circle
                              </span>
                              Selected
                            </span>
                          )}
                          {location.isDefault && !isActive && (
                            <span
                              className="inline-flex items-center gap-1 bg-deep-plum/10 text-deep-plum px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
                            >
                              Default
                            </span>
                          )}
                          {location.isDefault && isActive && (
                            <span className="inline-flex items-center gap-1 bg-white/15 text-white/90 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest">
                              Default
                            </span>
                          )}
                        </div>
                        <h2
                          className={`font-headline font-bold text-sm leading-tight ${
                            isActive
                              ? "text-white"
                              : "text-deep-plum [text-shadow:0_1px_1px_rgba(255,255,255,0.75)]"
                          }`}
                        >
                          {location.name}
                        </h2>
                      </div>
                    </div>

                    {/* Meta row: human-readable address */}
                    <div
                      className={`flex flex-wrap gap-x-4 gap-y-1 mt-2 md:mt-3 text-xs ${
                        isActive
                          ? "text-white/80"
                          : "text-deep-plum/75 md:text-on-surface-variant"
                      }`}
                    >
                      <span className="flex items-start gap-1.5 min-w-0">
                        <span className="material-symbols-outlined !text-[14px] shrink-0 mt-0.5">
                          location_on
                        </span>
                        <span className="line-clamp-2">
                          {location.address ||
                            `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                        </span>
                      </span>
                    </div>

                    {/* CTA */}
                    <button
                      id={`select-location-${location.id}`}
                      type="button"
                      disabled={isNavigating}
                      aria-label={`Select ${location.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectLocation(location);
                      }}
                      className={`
                        mt-3 md:mt-4 w-full py-2.5 rounded-full text-[12px] font-label-bold uppercase tracking-widest
                        transition-all duration-200 active:scale-95 flex items-center justify-center gap-2
                        ${
                          isNavigating && isSelected
                            ? "opacity-70 cursor-wait"
                            : isActive
                            ? "bg-vibrant-magenta text-white hover:bg-[#e05095] shadow-[0_4px_16px_-4px_rgba(255,105,180,0.5)]"
                            : "bg-deep-plum text-white hover:bg-black shadow-sm"
                        }
                      `}
                    >
                      {isNavigating && isSelected ? (
                        <>
                          <span className="material-symbols-outlined !text-[14px] animate-spin">
                            progress_activity
                          </span>
                          Redirecting…
                        </>
                      ) : (
                        <>
                          Shop here
                          <span className="material-symbols-outlined !text-[14px] group-hover:translate-x-0.5 transition-transform">
                            arrow_forward
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Footer note — compact on mobile, full on desktop ─────────── */}
        <div
          className={`
            relative shrink-0 flex items-center gap-2
            border-t border-white/35 md:border-outline-variant/20
            bg-white/25 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none
            px-4 md:px-6
            ${compactMobile ? "py-2.5" : "py-3 md:py-4"}
            pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:pb-4
          `}
        >
          <span className="material-symbols-outlined !text-[14px] text-deep-plum/45 shrink-0">
            info
          </span>
          <p className="text-[11px] text-deep-plum/70 md:text-outline/70 leading-relaxed [text-shadow:0_1px_1px_rgba(255,255,255,0.7)]">
            Your product catalog is shared across all locations under this brand.
          </p>
        </div>
      </div>
    </div>
  );
}