/**
 * Offline-only order path for wedding & icing cakes.
 *
 * Products in these categories stay browseable (prices shown) but cannot be
 * added to cart / checked out. Customers order via WhatsApp or visit the bakery.
 *
 * Exception: products also in `heart-cake` stay **online**. Heart SKUs (H1…)
 * often have "Wedding" in the title and get tagged wedding-cakes, but they are
 * regular heart cakes customers should buy through the site.
 *
 * Keep handles in sync with:
 *   apps/backend/src/utils/offline-order-categories.ts
 */

import { whatsAppOrderHref } from "@/lib/data/logistics"

/** Category handles that must not use online checkout. Change code to expand. */
export const OFFLINE_ORDER_CATEGORY_HANDLES = [
  "icing-cakes",
  "wedding-cakes",
] as const

/**
 * If a product has any of these, it stays online even when also in wedding-cakes.
 * (Icing cakes remain offline regardless.)
 */
export const ONLINE_ORDER_EXCEPTION_HANDLES = ["heart-cake"] as const

export type OfflineOrderCategoryHandle =
  (typeof OFFLINE_ORDER_CATEGORY_HANDLES)[number]

const OFFLINE_HANDLE_SET = new Set<string>(OFFLINE_ORDER_CATEGORY_HANDLES)
const ONLINE_EXCEPTION_SET = new Set<string>(ONLINE_ORDER_EXCEPTION_HANDLES)

/** Prefer this order when listing dual offline categories in WhatsApp. */
const LABEL_ORDER: OfflineOrderCategoryHandle[] = [
  "wedding-cakes",
  "icing-cakes",
]

const HANDLE_LABEL_FALLBACK: Record<OfflineOrderCategoryHandle, string> = {
  "wedding-cakes": "Wedding cake",
  "icing-cakes": "Icing cake",
}

export const OFFLINE_ORDER_COPY = {
  badge: "WhatsApp order",
  primaryCta: "Order on WhatsApp",
  secondaryCta: "Visit bakery / contact us",
  helper:
    "Wedding & icing cakes are ordered with our team — not via online checkout.",
  cartBanner:
    "Wedding/icing cakes were removed — order those via WhatsApp or in store.",
  apiMessage:
    "This cake is ordered via WhatsApp or in store, not online checkout.",
} as const

export type OfflineCategoryLike = {
  handle?: string | null
  name?: string | null
}

export function isOfflineOrderCategoryHandle(
  handle: string | null | undefined
): boolean {
  if (!handle) return false
  return OFFLINE_HANDLE_SET.has(handle.trim().toLowerCase())
}

function categoriesFromInput(
  input:
    | { categories?: OfflineCategoryLike[] | null }
    | OfflineCategoryLike[]
    | null
    | undefined
): OfflineCategoryLike[] {
  if (!input) return []
  if (Array.isArray(input)) return input
  return input.categories ?? []
}

function normalizedHandles(
  categories: OfflineCategoryLike[]
): Set<string> {
  const set = new Set<string>()
  for (const c of categories) {
    const h = (c?.handle ?? "").trim().toLowerCase()
    if (h) set.add(h)
  }
  return set
}

/**
 * True when the product must not use online checkout.
 *
 * Rules:
 *  1. `icing-cakes` → always offline
 *  2. `wedding-cakes` → offline unless also `heart-cake` (heart cakes stay online)
 *  3. Otherwise online
 */
export function isOfflineOrderProduct(
  input:
    | { categories?: OfflineCategoryLike[] | null }
    | OfflineCategoryLike[]
    | null
    | undefined
): boolean {
  const handles = normalizedHandles(categoriesFromInput(input))
  if (handles.has("icing-cakes")) return true
  if (handles.has("wedding-cakes")) {
    // Heart cakes (H-prefix) often share the wedding keyword but are site-orderable.
    for (const ex of ONLINE_EXCEPTION_SET) {
      if (handles.has(ex)) return false
    }
    return true
  }
  return false
}

/**
 * Human labels for WhatsApp prefill. If both wedding + icing, list both.
 * Order: wedding first, then icing.
 */
export function offlineOrderCategoryLabels(
  categories: OfflineCategoryLike[] | null | undefined
): string[] {
  const offline = (categories ?? []).filter((c) =>
    isOfflineOrderCategoryHandle(c?.handle)
  )
  if (!offline.length) return []

  const byHandle = new Map<string, OfflineCategoryLike>()
  for (const c of offline) {
    const h = (c.handle ?? "").trim().toLowerCase()
    if (h && !byHandle.has(h)) byHandle.set(h, c)
  }

  const labels: string[] = []
  for (const handle of LABEL_ORDER) {
    const cat = byHandle.get(handle)
    if (!cat) continue
    labels.push(labelForOfflineCategory(cat, handle))
    byHandle.delete(handle)
  }
  // Any unexpected offline handle (future code change without updating order)
  for (const [handle, cat] of byHandle) {
    labels.push(
      labelForOfflineCategory(
        cat,
        handle as OfflineOrderCategoryHandle
      )
    )
  }
  return labels
}

function labelForOfflineCategory(
  cat: OfflineCategoryLike,
  handle: string
): string {
  const name = (cat.name ?? "").trim()
  if (name) {
    // "Wedding Cakes" → "Wedding cake" for WhatsApp tone
    if (/cakes?$/i.test(name)) {
      return name.replace(/cakes?$/i, "cake").replace(/\s+/g, " ").trim()
    }
    return name
  }
  return (
    HANDLE_LABEL_FALLBACK[handle as OfflineOrderCategoryHandle] ??
    handle.replace(/-/g, " ")
  )
}

export type OfflinePriceVariantLike = {
  calculated_price?: {
    calculated_amount?: number | null
    currency_code?: string | null
  } | null
  prices?: Array<{ amount?: number | null; currency_code?: string | null }> | null
  price_set?: {
    money_amounts?: Array<{
      amount?: number | null
      currency_code?: string | null
    }> | null
  } | null
}

function variantAmount(
  variant: OfflinePriceVariantLike
): { amount: number; currency_code: string } | null {
  const calc = variant.calculated_price
  if (calc?.calculated_amount != null) {
    return {
      amount: calc.calculated_amount,
      currency_code: calc.currency_code ?? "gbp",
    }
  }
  const price =
    variant.prices?.[0] ?? variant.price_set?.money_amounts?.[0] ?? null
  if (price?.amount != null) {
    return {
      amount: price.amount,
      currency_code: price.currency_code ?? "gbp",
    }
  }
  return null
}

function formatMoney(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode?.toUpperCase() ?? "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Price label for offline products. Multi-variant with different amounts →
 * "From £X" (cheapest). Single amount → "£X".
 */
export function formatOfflinePriceLabel(
  variants: OfflinePriceVariantLike[] | null | undefined
): string | null {
  if (!variants?.length) return null

  const priced = variants
    .map(variantAmount)
    .filter((p): p is { amount: number; currency_code: string } => p != null)

  if (!priced.length) return null

  const currency = priced[0].currency_code
  const amounts = priced.map((p) => p.amount)
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  const formatted = formatMoney(min, currency)

  if (min !== max) return `From ${formatted}`
  return formatted
}

export function buildOfflineWhatsAppPrefill(input: {
  title: string
  url: string
  priceLabel?: string | null
  categoryLabels?: string[]
  storeName: string
}): string {
  const lines = [
    "Hi Cake Break — I'd like to order this cake:",
    input.title.trim(),
  ]
  if (input.categoryLabels?.length) {
    lines.push(`Type: ${input.categoryLabels.join(", ")}`)
  }
  if (input.priceLabel?.trim()) {
    lines.push(`Price: ${input.priceLabel.trim()}`)
  }
  lines.push(`Link: ${input.url.trim()}`)
  lines.push(`Bakery: ${input.storeName.trim()}`)
  lines.push("")
  lines.push("Please help me place this order.")
  return lines.join("\n")
}

export function offlineOrderWhatsAppHref(prefill: string): string {
  return whatsAppOrderHref(prefill)
}
