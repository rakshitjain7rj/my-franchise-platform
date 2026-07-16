"use server";

/**
 * src/lib/auth/storePreferenceActions.ts
 *
 * Server Actions for persisting a logged-in customer's preferred bakery
 * location to their Medusa customer metadata.
 *
 * Design:
 *  - Guests use a 6-month cookie (handled by middleware / store-cookies.ts).
 *  - When a customer logs in, their guest cookie is synced to server metadata
 *    (server wins if they already have a saved preference).
 *  - While logged in, store changes are written directly to the server.
 *  - The session cookie (`selected_store_location_id`, no maxAge) is kept as a
 *    short-lived SSR performance cache — middleware reads it without an API call.
 *  - On logout, both store cookies are deleted; the server metadata persists.
 */

import { cookies } from "next/headers";
import { getMedusaHeaders } from "@/lib/medusa/headers";

const BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ??
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ??
  "http://localhost:9000";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write the store selection as a session cookie (no maxAge) so the browser
 * clears it on close.  Middleware still reads this cookie for every SSR
 * request, keeping server-rendered pages fast without an extra API call.
 */
async function setSessionStoreCookies(
  storeId: string,
  storeName: string
): Promise<void> {
  const cookieStore = await cookies();
  const opts = {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: false, // must be readable by client-side JS (Header, BakerySidebar)
    // No maxAge: session cookie — cleared when the browser closes.
  };
  cookieStore.set("selected_store_location_id", storeId, opts);
  if (storeName) {
    cookieStore.set("selected_store_name", storeName, opts);
  }
}

/**
 * Delete both store cookies.  Called on logout so the next visit falls back
 * to the franchise default rather than stale data.
 */
export async function clearSessionStoreCookies(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("selected_store_location_id");
    cookieStore.delete("selected_store_name");
  } catch (err) {
    console.error("[clearSessionStoreCookies]", err);
  }
}

// ---------------------------------------------------------------------------
// Public Server Actions
// ---------------------------------------------------------------------------

export interface StorePreference {
  storeId: string;
  storeName: string;
}

/**
 * Save the customer's preferred bakery location to their Medusa metadata.
 *
 * Also refreshes the session cookie so subsequent SSR requests see the new
 * store immediately.
 *
 * Safe to call from Client Components — it is a Server Action.
 */
export async function saveStorePreference(
  storeId: string,
  storeName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getMedusaHeaders();
    if (!headers["Authorization"]) {
      // Not logged in — silently skip; the cookie path handles guests.
      return { success: false, error: "Not authenticated." };
    }

    const res = await fetch(`${BACKEND_URL}/store/customers/me`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        metadata: {
          preferred_store_id: storeId,
          preferred_store_name: storeName,
        },
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[saveStorePreference] Failed:", body);
      return {
        success: false,
        error: body.message ?? "Failed to save store preference.",
      };
    }

    // Keep the session cookie in sync so middleware / SSR stay fast.
    await setSessionStoreCookies(storeId, storeName);

    console.log("[saveStorePreference] Saved preferred_store_id:", storeId);
    return { success: true };
  } catch (err) {
    console.error("[saveStorePreference] Error:", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

/**
 * Load the customer's preferred bakery from their Medusa metadata and write
 * it as a session cookie so middleware / SSR picks it up for this session.
 *
 * Returns the saved preference (if any) so the caller can decide whether to
 * fall back to a guest cookie or the franchise default.
 */
export async function loadStorePreferenceFromServer(): Promise<StorePreference | null> {
  try {
    const headers = await getMedusaHeaders();
    if (!headers["Authorization"]) {
      return null;
    }

    const res = await fetch(`${BACKEND_URL}/store/customers/me`, {
      headers,
      cache: "no-store",
    });

    if (!res.ok) return null;

    const body = await res.json();
    const metadata = body.customer?.metadata as
      | Record<string, string>
      | undefined;

    const storeId = metadata?.preferred_store_id?.trim();
    const storeName = metadata?.preferred_store_name?.trim() ?? "";

    if (!storeId) {
      console.log("[loadStorePreferenceFromServer] No server preference found.");
      return null;
    }

    // Refresh the session cookie so SSR picks it up immediately.
    await setSessionStoreCookies(storeId, storeName);

    console.log(
      "[loadStorePreferenceFromServer] Loaded preferred_store_id:",
      storeId
    );
    return { storeId, storeName };
  } catch (err) {
    console.error("[loadStorePreferenceFromServer] Error:", err);
    return null;
  }
}
