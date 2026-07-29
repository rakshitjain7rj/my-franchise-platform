/**
 * app/wishlist/page.tsx
 *
 * Public wishlist page — guests and signed-in customers share one route.
 * Storage is client-side localStorage; no auth gate.
 */

import type { Metadata } from "next";
import WishlistPageClient from "./WishlistPageClient";

export const metadata: Metadata = {
  title: "My Wishlist | Cake Break",
  description: "Your favorite cakes saved for later.",
};

export default function WishlistPage() {
  return <WishlistPageClient />;
}
