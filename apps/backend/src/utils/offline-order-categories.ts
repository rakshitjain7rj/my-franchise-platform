/**
 * Offline-only order path for wedding & icing cakes.
 *
 * Products in these categories must not be added to cart or completed online.
 * Keep handles in sync with:
 *   apps/web/src/lib/product/offline-order.ts
 */

export const OFFLINE_ORDER_CATEGORY_HANDLES = [
  "icing-cakes",
  "wedding-cakes",
] as const

const OFFLINE_HANDLE_SET = new Set<string>(OFFLINE_ORDER_CATEGORY_HANDLES)

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
  return categories.some((c) => isOfflineOrderCategoryHandle(c?.handle))
}
