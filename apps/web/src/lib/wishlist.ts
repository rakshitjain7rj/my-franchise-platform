"use client";

export interface WishlistItem {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
  price: string;
}

export function getWishlist(): WishlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("cake_wishlist");
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
      localStorage.setItem("cake_wishlist", JSON.stringify(list));
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
    localStorage.setItem("cake_wishlist", JSON.stringify(filtered));
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
