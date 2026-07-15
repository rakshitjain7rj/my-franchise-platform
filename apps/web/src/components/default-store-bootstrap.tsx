"use client";

/**
 * DefaultStoreBootstrap
 *
 * For first-time visitors who have not yet chosen a bakery:
 *   1. Read the active franchise from the `franchise_id` cookie (set by middleware).
 *   2. Fetch the franchise default location from the Medusa Store API.
 *   3. Write `selected_store_location_id` + `selected_store_name` cookies so the
 *      rest of the app (cart, inventory, header label) treats that bakery as selected.
 *
 * Once the user picks a different store (map / sidebar), those cookies are
 * overwritten with a long-lived max-age and this component becomes a no-op
 * for that browser — we never overwrite an existing selection.
 */

import { useEffect, useRef } from "react";
import { medusaFetch } from "@/lib/medusa";
import {
  FRANCHISE_COOKIE,
  setPersistentCookie,
  STORE_ID_COOKIE,
  STORE_NAME_COOKIE,
} from "@/lib/store-cookies";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

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

    const existingStoreId = getCookie(STORE_ID_COOKIE)?.trim();
    if (existingStoreId) {
      // User (or a previous bootstrap) already has a selection — keep it.
      return;
    }

    const franchiseId = getCookie(FRANCHISE_COOKIE)?.trim();
    if (!franchiseId) {
      // Middleware should set franchise_id; if absent, wait for next navigation.
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
      if (getCookie(STORE_ID_COOKIE)?.trim()) return;

      setPersistentCookie(STORE_ID_COOKIE, data.location.id);
      if (data.location.name) {
        setPersistentCookie(STORE_NAME_COOKIE, data.location.name);
      }

      // Notify header / other listeners that the selected store changed.
      try {
        window.dispatchEvent(
          new CustomEvent("store-selection-changed", {
            detail: {
              storeLocationId: data.location.id,
              storeName: data.location.name,
              source: "default-bootstrap",
            },
          })
        );
      } catch {
        // ignore (older browsers)
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
