"use client";

/**
 * MapRoutingShell — Client-side shell for the Location Picker page.
 *
 * Manages the `highlightedId` state shared between the BakerySidebar
 * and the StoreMap.
 *
 * - Clicking a marker in the map → highlights the corresponding sidebar card.
 * - Clicking a sidebar card (without the CTA) → flies the map to that marker.
 *
 * On first paint the server may pass `initialHighlightedId` /
 * `initialSelectedId` from the user's cookie or the admin default store so
 * the map opens already focused on the right bakery.
 *
 * The `franchiseId` (brand) is passed through read-only — it is never
 * mutated here. Only `selected_store_location_id` is written on selection.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BakerySidebar, { type Franchise } from "./BakerySidebar";
import StoreMap, { type MapMarker } from "./LeafletMap";
import type { StoreLocationCard } from "../map-routing/page";
import {
  readSelectedStore,
  selectStore,
} from "@/lib/store-selection";
import { saveStorePreference } from "@/lib/auth/storePreferenceActions";

interface MapRoutingShellProps {
  /** The active Franchise (brand) ID — read-only, never mutated. */
  franchiseId: string;
  /** StoreLocation records belonging to this franchise. */
  locations: StoreLocationCard[];
  markers: MapMarker[];
  /**
   * Bakery to focus on the map / sidebar when the page first loads
   * (user cookie or admin-configured default).
   */
  initialHighlightedId?: string | null;
  /**
   * Bakery treated as currently selected (shows "Selected" in the sidebar).
   * Same source as `initialHighlightedId` in the common case.
   */
  initialSelectedId?: string | null;
  /**
   * How the initial selection was resolved — used only to seed cookies when
   * the admin default is applied and the visitor has no store cookie yet.
   */
  selectionSource?: "cookie" | "default";
  /**
   * Whether the current visitor is logged in.
   * When true, store selection changes are persisted to the server metadata
   * in addition to the local session cookie.
   */
  isLoggedIn?: boolean;
}

export default function MapRoutingShell({
  franchiseId,
  locations,
  markers,
  initialHighlightedId = null,
  initialSelectedId = null,
  selectionSource = "default",
  isLoggedIn = false,
}: MapRoutingShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [highlightedId, setHighlightedId] = useState<string | null>(
    initialHighlightedId
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [isNavigating, setIsNavigating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // If the visitor has no store cookie yet, persist the admin default so the
  // rest of the storefront (cart, inventory, header) agrees with the map.
  // Never overwrite an existing user choice.
  useEffect(() => {
    if (selectionSource !== "default" || !initialSelectedId) return;
    if (readSelectedStore().storeLocationId) return;

    const loc = locations.find((l) => l.id === initialSelectedId);
    if (!loc) return;

    selectStore(
      {
        storeLocationId: loc.id,
        storeName: loc.name,
        franchiseId: loc.franchiseId,
      },
      "default-map"
    );
  }, [selectionSource, initialSelectedId, locations]);

  const handleSelectStore = (storeId: string, franchiseId: string, storeName: string) => {
    if (isNavigating) return;
    
    setSelectedId(storeId);
    setHighlightedId(storeId);
    setIsNavigating(true);

    // Persist until the shopper picks another bakery (long-lived cookies).
    // Explicit user choice always wins over the admin default bootstrap.
    selectStore(
      {
        storeLocationId: storeId,
        storeName,
        franchiseId,
      },
      "user-select"
    );

    // If the user is logged in, also persist the preference to the server so
    // it survives cookie expiration and syncs across devices.
    if (isLoggedIn) {
      saveStorePreference(storeId, storeName).catch((err) =>
        console.error("[MapRoutingShell] Failed to save store preference:", err)
      );
    }

    // Show toast message
    setToastMessage(`Switched to ${storeName}`);

    // Redirect after 1.5 seconds so the user has time to read the toast
    const redirectTo = searchParams.get("redirect") || "/";
    setTimeout(() => {
      router.push(redirectTo);
    }, 1500);
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#E2D4F0]">
      {/* ── Custom Keyframe Animations ────────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes toastSlideIn {
          0% { opacity: 0; transform: translate(-50%, -20px) scale(0.95); }
          100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
        @media (min-width: 768px) {
          @keyframes toastSlideIn {
            0% { opacity: 0; transform: translate(0, -20px) scale(0.95); }
            100% { opacity: 1; transform: translate(0, 0) scale(1); }
          }
        }
        .toast-animate {
          animation: toastSlideIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}} />

      {/* ── Premium Toast Notification ────────────────────────────────────── */}
      {toastMessage && (
        <div className="
          fixed top-6 left-1/2 -translate-x-1/2
          md:left-auto md:right-6 md:translate-x-0
          z-[9999] toast-animate
        ">
          <div className="
            bg-[#4A154B] text-white px-6 py-4 rounded-2xl
            shadow-[0_12px_40px_-8px_rgba(74,21,75,0.45)]
            border border-white/10 backdrop-blur-md
            flex items-center gap-3
          ">
            <div className="w-7 h-7 rounded-full bg-[#FF69B4] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[16px] text-white font-bold">
                done
              </span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FF69B4]">Active Location</p>
              <p className="font-headline text-sm font-semibold text-white mt-0.5">{toastMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Full-bleed Leaflet Map ────────────────────────────────────────── */}
      <StoreMap
        markers={markers}
        selectedId={highlightedId}
        onSelectMarker={(marker) => setHighlightedId(marker.id)}
        onSelectStore={(marker) => handleSelectStore(marker.id, marker.franchiseId, marker.name)}
      />

      {/* ── Floating sidebar overlay ──────────────────────────────────────── */}
      {/*
          On mobile: anchored to the bottom, scrolling horizontally.
          On desktop: fixed to the left, full height, 420 px wide.
          z-index must clear Leaflet's z-1000 control layer.
      */}
      <div
        className="
          absolute inset-x-0 bottom-0 z-[1001]
          md:inset-x-auto md:left-6 md:top-6 md:bottom-6
          flex items-end md:items-stretch
          pointer-events-none
        "
      >
        <div className="pointer-events-auto w-full md:w-auto px-3 pb-3 md:p-0 md:h-full">
          <BakerySidebar
            franchiseId={franchiseId}
            locations={locations}
            highlightedId={highlightedId}
            onHighlight={(id) => setHighlightedId(id)}
            onSelectStore={(franchise) => handleSelectStore(franchise.id, franchise.franchiseId, franchise.name)}
            selectedId={selectedId}
            isNavigating={isNavigating}
          />
        </div>
      </div>

    </div>
  );
}
