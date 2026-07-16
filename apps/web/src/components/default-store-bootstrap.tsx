"use client";

/**
 * DefaultStoreBootstrap
 *
 * For first-time visitors who have not yet chosen a bakery:
 *   1. Read the active franchise from the `franchise_id` cookie (set by middleware).
 *   2. Fetch the franchise default location from the Medusa Store API.
 *   3. Write store cookies via `selectStore` so the rest of the app treats
 *      that bakery as selected.
 *
 * Once the user picks a different store (map / sidebar), those cookies are
 * overwritten and this component becomes a no-op for that browser.
 */

import { useEffect, useRef } from "react";
import { medusaFetch } from "@/lib/medusa";
import {
  getBrowserCookie,
  FRANCHISE_COOKIE,
  readSelectedStore,
  selectStore,
  STORE_ID_COOKIE,
} from "@/lib/store-selection";

interface DefaultLocationResponse {
  location: {
    id: string;
    name: string;
    code?: string;
  } | null;
}

export default function DefaultStoreBootstrap() {
  const ran = useRef(false);

  useEffect(() => {
    // StrictMode double-mount guard + one-shot per page session.
    if (ran.current) return;
    ran.current = true;

    const existingStoreId = getBrowserCookie(STORE_ID_COOKIE)?.trim();
    if (existingStoreId) {
      return;
    }

    const franchiseId = getBrowserCookie(FRANCHISE_COOKIE)?.trim();
    if (!franchiseId) {
      return;
    }

    let cancelled = false;

    ;(async () => {
      const { data, error } = await medusaFetch<DefaultLocationResponse>({
        path: `/store/franchises/${encodeURIComponent(franchiseId)}/default-location`,
        cache: "no-store",
      });

      if (cancelled || error || !data?.location?.id) {
        if (error) {
          console.warn(
            "[DefaultStoreBootstrap] Failed to resolve default store:",
            error
          );
        }
        return;
      }

      // Re-check cookie in case the user selected a store while the request
      // was in flight — never clobber an explicit choice.
      if (readSelectedStore().storeLocationId) return;

      selectStore(
        {
          storeLocationId: data.location.id,
          storeName: data.location.name,
          franchiseId,
        },
        "default-bootstrap"
      );
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
