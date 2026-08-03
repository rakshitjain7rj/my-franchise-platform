/**
 * Offline-only order path for wedding & icing cakes.
 *
 * Products in these categories must not be added to cart or completed online.
 *
 * Exception: `heart-cake` products stay online even if also tagged wedding-cakes
 * (e.g. "(H1) Heart Wedding Cake" — a heart shape, not a consultative wedding cake).
 * Icing cakes remain offline regardless.
 *
 * Keep handles in sync with:
 *   apps/web/src/lib/product/offline-order.ts
 */

export const OFFLINE_ORDER_CATEGORY_HANDLES = [
  "icing-cakes",
  "wedding-cakes",
] as const

export const ONLINE_ORDER_EXCEPTION_HANDLES = ["heart-cake"] as const

const OFFLINE_HANDLE_SET = new Set<string>(OFFLINE_ORDER_CATEGORY_HANDLES)
const ONLINE_EXCEPTION_SET = new Set<string>(ONLINE_ORDER_EXCEPTION_HANDLES)

export const OFFLINE_ORDER_API_MESSAGE =
  "This cake is ordered via WhatsApp or in store, not online checkout."

export function isOfflineOrderCategoryHandle(
  handle: string | null | undefined
): boolean {
  if (!handle) return false
  return OFFLINE_HANDLE_SET.has(handle.trim().toLowerCase())
}

export function productHasOfflineOrderCategory(
  categories:
    | Array<{ handle?: string | null } | null | undefined>
    | null
    | undefined
): boolean {
  if (!categories?.length) return false

  const handles = new Set<string>()
  for (const c of categories) {
    const h = (c?.handle ?? "").trim().toLowerCase()
    if (h) handles.add(h)
  }

  if (handles.has("icing-cakes")) return true
  if (handles.has("wedding-cakes")) {
    for (const ex of ONLINE_EXCEPTION_SET) {
      if (handles.has(ex)) return false
    }
    return true
  }
  return false
}
