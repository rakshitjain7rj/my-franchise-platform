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
  payment_status: string | null
  fulfillment_status: string | null
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

export const formatFulfillmentMethod = (
  method: string | null | undefined
): string => {
  if (!method) return ""
  if (method === "pickup") return "Store pickup"
  if (method === "delivery") return "Local delivery"
  return method
}

export const paymentBadgeColor = (
  status: string | null | undefined
): "green" | "orange" | "red" | "grey" | "blue" => {
  switch ((status ?? "").toLowerCase()) {
    case "captured":
    case "paid":
      return "green"
    case "awaiting":
    case "not_paid":
    case "authorized":
      return "orange"
    case "canceled":
    case "refunded":
    case "requires_action":
      return "red"
    default:
      return "grey"
  }
}

export const fulfillmentBadgeColor = (
  status: string | null | undefined
): "green" | "orange" | "red" | "grey" | "blue" => {
  switch ((status ?? "").toLowerCase()) {
    case "fulfilled":
    case "shipped":
    case "delivered":
      return "green"
    case "partially_fulfilled":
    case "partially_shipped":
      return "blue"
    case "not_fulfilled":
    case "canceled":
      return "orange"
    default:
      return "grey"
  }
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

export type FulfillCakeOrderResponse = {
  fulfillment_id: string | null
  order_id: string
  store_location_id: string
  stock_location_id: string
  shipping_option_id: string
  items: Array<{ id: string; quantity: number }>
}

/** Pull a human-readable message from Medusa FetchError / generic Error. */
export const getApiErrorMessage = (err: unknown, fallback: string): string => {
  if (!err) return fallback
  if (typeof err === "string" && err.trim()) return err
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "object") {
    const e = err as {
      message?: unknown
      error?: string | { message?: string }
    }
    if (typeof e.message === "string" && e.message.trim()) return e.message
    if (typeof e.error === "string" && e.error.trim()) return e.error
    if (
      e.error &&
      typeof e.error === "object" &&
      typeof e.error.message === "string"
    ) {
      return e.error.message
    }
  }
  return fallback
}

/**
 * One-click fulfill: uses the order's linked store → stock location and the
 * shipping method the customer already chose. No dialog, no re-selection.
 */
export const fulfillCakeOrder = (
  orderId: string
): Promise<FulfillCakeOrderResponse> =>
  sdk.client.fetch<FulfillCakeOrderResponse>(
    `/admin/cake-orders/${orderId}/fulfill`,
    { method: "POST" }
  )

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
