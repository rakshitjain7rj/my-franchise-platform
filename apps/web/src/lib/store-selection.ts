/**
 * Canonical store-selection protocol for the storefront.
 *
 * Cookies are the source of truth; `store-selection-changed` notifies other
 * client components (Header, product page, banner, cart) without polling.
 *
 * Prefer `selectStore` + `useSelectedStore` over hand-rolling cookies/events.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FRANCHISE_COOKIE,
  getBrowserCookie,
  setPersistentCookie,
  STORE_ID_COOKIE,
  STORE_NAME_COOKIE,
} from "@/lib/store-cookies";

export {
  FRANCHISE_COOKIE,
  getBrowserCookie,
  setPersistentCookie,
  STORE_ID_COOKIE,
  STORE_NAME_COOKIE,
} from "@/lib/store-cookies";

/** Window event name — keep stable; historical listeners may still use the string. */
export const STORE_SELECTION_CHANGED_EVENT = "store-selection-changed";

export type StoreSelectionSource =
  | "user-select"
  | "product-detail"
  | "default-bootstrap"
  | "default-map"
  | "cart"
  | "header"
  | string;

export interface StoreSelectionDetail {
  storeLocationId: string;
  storeName?: string;
  franchiseId?: string;
  source?: StoreSelectionSource;
}

export interface SelectedStore {
  storeLocationId: string | null;
  storeName: string | null;
  franchiseId: string | null;
}

export function readSelectedStore(): SelectedStore {
  return {
    storeLocationId: getBrowserCookie(STORE_ID_COOKIE)?.trim() || null,
    storeName: getBrowserCookie(STORE_NAME_COOKIE)?.trim() || null,
    franchiseId: getBrowserCookie(FRANCHISE_COOKIE)?.trim() || null,
  };
}

export interface SelectStoreInput {
  storeLocationId: string;
  storeName?: string | null;
  franchiseId?: string | null;
}

/**
 * Bakery is universal for the order: once the cart has line items, switching
 * branch is blocked until the cart is emptied (avoids mixed-branch confusion).
 */
export function isStoreSelectionLocked(cartItemCount: number): boolean {
  return cartItemCount > 0;
}

/** Shown when the user tries to change bakery with items still in the cart. */
export const STORE_SELECTION_LOCKED_MESSAGE =
  "Empty your cart before changing bakery.";

export type TrySelectStoreResult =
  | { ok: true; selection: SelectedStore }
  | { ok: false; reason: "locked"; selection: SelectedStore };

/**
 * Persist bakery selection and notify all listeners.
 * Does nothing when storeLocationId is empty.
 *
 * Prefer `trySelectStore` for user-driven switches so a non-empty cart cannot
 * rebind the whole order to another branch.
 */
export function selectStore(
  input: SelectStoreInput,
  source: StoreSelectionSource = "user-select"
): SelectedStore {
  const storeLocationId = input.storeLocationId?.trim();
  if (!storeLocationId) {
    return readSelectedStore();
  }

  const storeName = input.storeName?.trim() || null;
  const franchiseId = input.franchiseId?.trim() || null;

  setPersistentCookie(STORE_ID_COOKIE, storeLocationId);
  if (storeName) {
    setPersistentCookie(STORE_NAME_COOKIE, storeName);
  }
  if (franchiseId) {
    setPersistentCookie(FRANCHISE_COOKIE, franchiseId);
  }

  const detail: StoreSelectionDetail = {
    storeLocationId,
    storeName: storeName ?? undefined,
    franchiseId: franchiseId ?? undefined,
    source,
  };

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent(STORE_SELECTION_CHANGED_EVENT, { detail })
      );
    } catch {
      // ignore (older browsers)
    }
  }

  return {
    storeLocationId,
    storeName,
    franchiseId:
      franchiseId ??
      (getBrowserCookie(FRANCHISE_COOKIE)?.trim() || null),
  };
}

/**
 * User-driven bakery change with cart lock enforcement.
 *
 * - Same bakery id (or empty input): always allowed (name hydrate / re-click).
 * - No bakery set yet: allowed even with items (recovery).
 * - Different bakery while cart has items: blocked.
 */
export function trySelectStore(
  input: SelectStoreInput,
  options: {
    cartItemCount: number;
    source?: StoreSelectionSource;
  }
): TrySelectStoreResult {
  const current = readSelectedStore();
  const nextId = input.storeLocationId?.trim();
  if (!nextId) {
    return { ok: true, selection: current };
  }

  if (current.storeLocationId === nextId) {
    return {
      ok: true,
      selection: selectStore(input, options.source ?? "user-select"),
    };
  }

  // Recovery: cart exists but no branch cookie — still need a fulfillment store.
  if (!current.storeLocationId) {
    return {
      ok: true,
      selection: selectStore(input, options.source ?? "user-select"),
    };
  }

  if (isStoreSelectionLocked(options.cartItemCount)) {
    return { ok: false, reason: "locked", selection: current };
  }

  return {
    ok: true,
    selection: selectStore(input, options.source ?? "user-select"),
  };
}

/**
 * Update only the display name cookie (e.g. hydrate name when id was already set).
 * Does not fire a selection-changed event unless `notify` is true.
 */
export function setSelectedStoreName(
  storeName: string,
  options?: { notify?: boolean; storeLocationId?: string }
): void {
  const name = storeName.trim();
  if (!name) return;
  setPersistentCookie(STORE_NAME_COOKIE, name);
  if (options?.notify && typeof window !== "undefined") {
    const id =
      options.storeLocationId?.trim() ||
      getBrowserCookie(STORE_ID_COOKIE)?.trim();
    if (!id) return;
    try {
      window.dispatchEvent(
        new CustomEvent(STORE_SELECTION_CHANGED_EVENT, {
          detail: {
            storeLocationId: id,
            storeName: name,
            source: "name-hydrate",
          } satisfies StoreSelectionDetail,
        })
      );
    } catch {
      // ignore
    }
  }
}

export type StoreSelectionListener = (detail: StoreSelectionDetail) => void;

/**
 * Subscribe to bakery selection changes. Returns an unsubscribe function.
 */
export function subscribeToStoreSelection(
  listener: StoreSelectionListener
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<StoreSelectionDetail>).detail ?? {
      storeLocationId: getBrowserCookie(STORE_ID_COOKIE)?.trim() || "",
    };
    listener(detail);
  };

  window.addEventListener(STORE_SELECTION_CHANGED_EVENT, handler);
  return () =>
    window.removeEventListener(STORE_SELECTION_CHANGED_EVENT, handler);
}

export interface UseSelectedStoreOptions {
  /**
   * When the local caller is the one that called `selectStore`, pass the same
   * source string here so the hook does not treat the echo as an external change.
   */
  ignoreSource?: StoreSelectionSource;
  /** Fires only for selections that did not originate from `ignoreSource`. */
  onExternalChange?: (
    selection: SelectedStore,
    detail: StoreSelectionDetail
  ) => void;
}

/**
 * React hook: current bakery selection + `select` helper.
 * Re-renders when any part of the app calls `selectStore`.
 */
export function useSelectedStore(options?: UseSelectedStoreOptions) {
  // Always start empty so SSR HTML matches the first client paint.
  // Cookies are browser-only; reading them in useState causes React #418.
  const [selection, setSelection] = useState<SelectedStore>({
    storeLocationId: null,
    storeName: null,
    franchiseId: null,
  });

  const ignoreSource = options?.ignoreSource;
  const onExternalChangeRef = useRef(options?.onExternalChange);
  onExternalChangeRef.current = options?.onExternalChange;

  useEffect(() => {
    // Sync once on mount (SSR → client cookie).
    setSelection(readSelectedStore());

    return subscribeToStoreSelection((detail) => {
      const next: SelectedStore = {
        storeLocationId:
          detail.storeLocationId?.trim() ||
          getBrowserCookie(STORE_ID_COOKIE)?.trim() ||
          null,
        storeName:
          detail.storeName?.trim() ||
          getBrowserCookie(STORE_NAME_COOKIE)?.trim() ||
          null,
        franchiseId:
          detail.franchiseId?.trim() ||
          getBrowserCookie(FRANCHISE_COOKIE)?.trim() ||
          null,
      };

      setSelection(next);

      if (ignoreSource && detail.source === ignoreSource) {
        return;
      }
      onExternalChangeRef.current?.(next, detail);
    });
  }, [ignoreSource]);

  const select = useCallback(
    (input: SelectStoreInput, source: StoreSelectionSource = "user-select") => {
      const next = selectStore(input, source);
      setSelection(next);
      return next;
    },
    []
  );

  return {
    storeLocationId: selection.storeLocationId,
    storeName: selection.storeName,
    franchiseId: selection.franchiseId,
    hasStore: Boolean(selection.storeLocationId),
    selectStore: select,
    /** Re-read cookies into state (rare; prefer selectStore / events). */
    refresh: () => setSelection(readSelectedStore()),
  };
}
