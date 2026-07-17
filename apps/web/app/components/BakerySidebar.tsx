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
    return q === "" || loc.name.toLowerCase().includes(q);
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
    <div className="w-full md:w-[420px] h-full flex flex-col">
      {/* ── Glassmorphism header panel ─────────────────────────────────────── */}
      <div
        className="
          bg-white/80 backdrop-blur-2xl
          border border-white/60
          rounded-2xl
          premium-shadow
          overflow-hidden
          flex flex-col
          h-full
        "
      >
        {/* ── Drag handle — visible on mobile, hidden on desktop ────────── */}
        <div className="flex justify-center pt-2.5 pb-0 md:hidden" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-deep-plum/20" />
        </div>
        {/* ── Brand header ─────────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-5 md:px-8 md:pt-8 md:pb-6 border-b border-outline-variant/20">
          {/* Logo / brand name */}
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-full bg-deep-plum flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[16px] text-white">
                cake
              </span>
            </div>
            <span className="font-headline text-[11px] font-bold uppercase tracking-[0.25em] text-deep-plum/60">
              Cake Break
            </span>
          </div>

          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-deep-plum leading-tight mt-2">
            Choose Your{" "}
            <span className="text-vibrant-magenta italic font-light">
              Bakery
            </span>
          </h1>
          <p className="font-body text-sm text-on-surface-variant mt-1 leading-relaxed">
            Pick a location for delivery &amp; pickup — your catalog stays the same.
          </p>

          {/* Search input */}
          <div className="relative mt-5">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-outline">
              <span className="material-symbols-outlined !text-[18px]">search</span>
            </span>
            <input
              id="location-search"
              type="text"
              placeholder="Search by area or postcode…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search bakery locations"
              className="
                w-full h-12 pl-11 pr-5
                bg-lavender-bg/60
                border border-outline-variant/40
                rounded-full
                text-sm text-deep-plum
                placeholder:text-outline/70
                focus:border-deep-plum focus:ring-0 outline-none
                transition-all
              "
            />
          </div>
        </div>

        {/* ── Location card list ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-3">
          {filteredLocations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <span className="material-symbols-outlined !text-[48px] text-outline/40 mb-3">
                location_off
              </span>
              <p className="font-headline text-sm font-semibold text-on-surface-variant">
                No locations found
              </p>
              <p className="text-xs text-outline mt-1">
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
                    ${
                      isActive
                        ? "bg-deep-plum border-deep-plum text-white shadow-[0_8px_32px_-8px_rgba(74,21,75,0.35)]"
                        : "bg-white/60 border-outline-variant/30 hover:border-deep-plum/30 hover:bg-white hover:premium-shadow"
                    }
                  `}
                >
                  {/* Selected indicator strip */}
                  {isActive && (
                    <div className="absolute left-0 top-4 bottom-4 w-0.5 bg-vibrant-magenta rounded-r-full" />
                  )}

                  <div className="px-5 py-4">
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
                            isActive ? "text-white" : "text-deep-plum"
                          }`}
                        >
                          {location.name}
                        </h2>
                      </div>
                    </div>

                    {/* Meta row: human-readable address */}
                    <div
                      className={`flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs ${
                        isActive ? "text-white/70" : "text-on-surface-variant"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px]">
                          location_on
                        </span>
                        {location.address || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                      </span>
                    </div>

                    {/* CTA */}
                    <button
                      id={`select-location-${location.id}`}
                      disabled={isNavigating}
                      aria-label={`Select ${location.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectLocation(location);
                      }}
                      className={`
                        mt-4 w-full py-2.5 rounded-full text-[12px] font-label-bold uppercase tracking-widest
                        transition-all duration-200 active:scale-95 flex items-center justify-center gap-2
                        ${
                          isNavigating && isSelected
                            ? "opacity-70 cursor-wait"
                            : isActive
                            ? "bg-vibrant-magenta text-white hover:bg-[#e05095] shadow-[0_4px_16px_-4px_rgba(255,105,180,0.5)]"
                            : "bg-deep-plum text-white hover:bg-black"
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

        {/* ── Footer note ──────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex items-center gap-2">
          <span className="material-symbols-outlined !text-[14px] text-outline/50">
            info
          </span>
          <p className="text-[11px] text-outline/70 leading-relaxed">
            Your product catalog is shared across all locations under this brand.
          </p>
        </div>
      </div>
    </div>
  );
}