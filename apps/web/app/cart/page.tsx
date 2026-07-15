/**
 * app/cart/page.tsx — Pre-Checkout Gatekeeper (Server Component shell)
 *
 * Force-dynamic so franchise + location cookies are always fresh.
 * Passes server-read cookie values to the client component so the initial
 * render is not flash-of-loading.
 */

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import CartPageClient from "./CartPageClient"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Your Cart | Cake Break",
  description: "Review your artisan cake order, select your pickup time, and proceed to checkout.",
}

export default async function CartPage() {
  const cookieStore = await cookies()
  const franchiseId = cookieStore.get("franchise_id")?.value ?? null
  const storeLocationId =
    cookieStore.get("selected_store_location_id")?.value ?? null

  // Middleware should have caught this, but belt-and-suspenders guard
  if (!franchiseId) {
    redirect("/map-routing?redirect=/cart")
  }

  return (
    <CartPageClient
      franchiseId={franchiseId}
      storeLocationId={storeLocationId}
    />
  )
}
