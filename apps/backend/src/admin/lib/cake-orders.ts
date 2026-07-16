/**
 * Shared types + fetch helper for the /admin/cake-orders endpoint.
 * Used by the Cake Orders production board route and the order-detail widget.
 */

import { sdk } from "./sdk"

export type CakeCustomization = {
  flavor: string | null
  servings: string | null
  /** "Mixed Jam" | "No Jam" from storefront line-item custom_attributes.jam */
  jam: string | null
  collection_date: string | null
  collection_time: string | null
  special_message: string | null
  inscription: string | null
  photo_url: string | null
  options: Record<string, string>
}

export type CakeOrderItem = {
  id: string
  title: string
  product_title: string | null
  variant_title: string | null
  quantity: number
  thumbnail: string | null
  cake: CakeCustomization
}

export type CakeOrder = {
  id: string
  display_id: number | null
  status: string
  created_at: string
  email: string | null
  currency_code: string | null
  total: number | null
  customer_name: string | null
  phone: string | null
  fulfillment_method: string | null
  requested_pickup_time: string | null
  notes_for_baker: string | null
  collection_date: string | null
  store_location: { id: string; name: string | null; code: string | null } | null
  items: CakeOrderItem[]
}

export type CakeOrdersResponse = {
  orders: CakeOrder[]
  count: number
  limit: number
  offset: number
}

export const fetchCakeOrders = (query: {
  order_id?: string
  date?: string
  limit?: number
  offset?: number
}): Promise<CakeOrdersResponse> =>
  sdk.client.fetch<CakeOrdersResponse>("/admin/cake-orders", { query })

export const formatMoney = (
  amount: number | null,
  currencyCode: string | null
): string => {
  if (amount == null) return "—"
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: (currencyCode ?? "GBP").toUpperCase(),
    }).format(amount)
  } catch {
    return `${amount}`
  }
}

/** "2026-07-04" → "Fri, 4 Jul 2026" (falls back to the raw string). */
export const formatCollectionDate = (date: string | null): string => {
  if (!date) return "No date set"
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export const isoDateWithOffset = (daysFromToday: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + daysFromToday)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}
