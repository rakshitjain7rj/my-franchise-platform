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
    return customerId ? `cake_wishlist_${customerId}` : "cake_wishlist_guest";
  } catch {
    return "cake_wishlist_guest";
  }
}

export function getWishlist(): WishlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(getWishlistKey());
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Error reading wishlist:", e);
    return [];
  }
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

