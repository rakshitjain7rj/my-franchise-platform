"use client";

export interface WishlistItem {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
  price: string;
}

/**
 * The localStorage key that holds the currently logged-in customer's ID.
 * Written by Header.tsx after a successful auth resolve, cleared on logout.
 */
const CUSTOMER_ID_KEY = "cake_customer_id";

/** Guest wishlist slot — independent of the active customer pointer. */
const GUEST_KEY = "cake_wishlist_guest";

/** sessionStorage key used to hand a post-signup transfer toast to /wishlist. */
export const WISHLIST_TRANSFER_TOAST_KEY = "cake_wishlist_transfer_toast";

/**
 * Returns the storage key scoped to the currently active user.
 * - Authenticated: "cake_wishlist_<customerId>"
 * - Guest / unauthenticated: "cake_wishlist_guest"
 *
 * This ensures each customer's wishlist is completely isolated, even when
 * multiple accounts share the same browser.
 */
function getWishlistKey(): string {
  try {
    const customerId = localStorage.getItem(CUSTOMER_ID_KEY);
    return customerId ? `cake_wishlist_${customerId}` : GUEST_KEY;
  } catch {
    return GUEST_KEY;
  }
}

function customerWishlistKey(customerId: string): string {
  return `cake_wishlist_${customerId}`;
}

function readKey(key: string): WishlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as WishlistItem[]) : [];
  } catch (e) {
    console.error("Error reading wishlist:", e);
    return [];
  }
}

function writeKey(key: string, items: WishlistItem[]): void {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(items));
    }
    window.dispatchEvent(new Event("wishlist-updated"));
  } catch (e) {
    console.error("Error writing wishlist:", e);
  }
}

export function getWishlist(): WishlistItem[] {
  if (typeof window === "undefined") return [];
  return readKey(getWishlistKey());
}

export function addToWishlist(item: WishlistItem): void {
  if (typeof window === "undefined") return;
  try {
    const list = getWishlist();
    if (!list.some((i) => i.id === item.id)) {
      list.push(item);
      localStorage.setItem(getWishlistKey(), JSON.stringify(list));
      window.dispatchEvent(new Event("wishlist-updated"));
    }
  } catch (e) {
    console.error("Error adding to wishlist:", e);
  }
}

export function removeFromWishlist(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = getWishlist();
    const filtered = list.filter((i) => i.id !== id);
    localStorage.setItem(getWishlistKey(), JSON.stringify(filtered));
    window.dispatchEvent(new Event("wishlist-updated"));
  } catch (e) {
    console.error("Error removing from wishlist:", e);
  }
}

export function isInWishlist(id: string): boolean {
  if (typeof window === "undefined") return false;
  const list = getWishlist();
  return list.some((i) => i.id === id);
}

/**
 * Persist (or clear) the current customer's ID in localStorage.
 * Called by Header after every auth resolution so all wishlist functions
 * automatically pick up the right per-user storage slot.
 */
export function setWishlistCustomerId(customerId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (customerId) {
      localStorage.setItem(CUSTOMER_ID_KEY, customerId);
    } else {
      localStorage.removeItem(CUSTOMER_ID_KEY);
    }
  } catch {
    // localStorage unavailable (private-browsing edge case) — silently ignore.
  }
}

/**
 * Signup-only: copy guest wishlist into the new customer's slot (union by product id),
 * clear the guest slot, and point the active customer id at this account.
 *
 * Uses absolute storage keys so it is safe even if Header has not yet flipped
 * `cake_customer_id` (or already has).
 *
 * @returns Number of guest items that were present (for toast copy).
 */
export function transferGuestWishlistToCustomer(customerId: string): number {
  if (typeof window === "undefined" || !customerId) return 0;

  try {
    const guestItems = readKey(GUEST_KEY);
    const guestCount = guestItems.length;
    const accountKey = customerWishlistKey(customerId);
    const accountItems = readKey(accountKey);

    // Guest order first, then any account-only ids (usually empty on signup).
    const seen = new Set<string>();
    const merged: WishlistItem[] = [];
    for (const item of [...guestItems, ...accountItems]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }

    writeKey(accountKey, merged);
    localStorage.removeItem(GUEST_KEY);
    setWishlistCustomerId(customerId);
    window.dispatchEvent(new Event("wishlist-updated"));

    return guestCount;
  } catch (e) {
    console.error("Error transferring guest wishlist:", e);
    return 0;
  }
}

/**
 * Login path: drop guest hearts so they never reappear after logout and never
 * bleed into another account. Does not copy into the account slot.
 */
export function discardGuestWishlist(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(GUEST_KEY) !== null) {
      localStorage.removeItem(GUEST_KEY);
      window.dispatchEvent(new Event("wishlist-updated"));
    }
  } catch (e) {
    console.error("Error discarding guest wishlist:", e);
  }
}
