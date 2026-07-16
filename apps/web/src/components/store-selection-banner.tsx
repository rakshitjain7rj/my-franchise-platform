"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  readSelectedStore,
  subscribeToStoreSelection,
} from "@/lib/store-selection";

/**
 * StoreSelectionBanner — A dismissable top-banner nudging visitors to pick
 * their nearest store location.
 *
 * Shows when:
 *   - No selected store cookie is present
 *   - The user hasn't dismissed the banner in the last 24 hours
 *
 * Stored dismissal key: `store_banner_dismissed_at` in localStorage.
 */

const DISMISS_KEY = "store_banner_dismissed_at";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function StoreSelectionBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const evaluate = () => {
      if (readSelectedStore().storeLocationId) {
        setVisible(false);
        return;
      }

      try {
        const dismissedAt = localStorage.getItem(DISMISS_KEY);
        if (dismissedAt) {
          const elapsed = Date.now() - parseInt(dismissedAt, 10);
          if (elapsed < DISMISS_DURATION_MS) {
            setVisible(false);
            return;
          }
        }
      } catch {
        // localStorage unavailable
      }

      setVisible(true);
    };

    evaluate();
    return subscribeToStoreSelection(evaluate);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {
      // ignore
    }
  };

  if (!visible) return null;

  return (
    <div className="bg-gradient-to-r from-deep-plum/90 via-vibrant-magenta/80 to-deep-plum/90 text-white py-2.5 px-4 md:px-8 relative z-[60]">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm">
          <span className="material-symbols-outlined !text-[18px] opacity-90">
            location_on
          </span>
          <span className="font-label-bold">
            Choose your nearest bakery for accurate stock &amp; delivery options
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/map-routing"
            className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-label-bold text-xs px-4 py-1.5 rounded-full transition-all"
          >
            <span className="material-symbols-outlined !text-[14px]">
              explore
            </span>
            Find a Bakery
          </Link>
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-white/20 rounded-full transition-colors"
            aria-label="Dismiss store selection banner"
          >
            <span className="material-symbols-outlined !text-[18px]">
              close
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
