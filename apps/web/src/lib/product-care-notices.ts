/**
 * Product care / disclaimer notices (photo cakes, etc.).
 * Prefer explicit metadata flags; fall back to title/handle/category heuristics.
 *
 * Accessories disclaimer is shown under every product image (not via this list).
 */

export type ProductCareKind = "photo"

export type ProductCareNotice = {
  kind: ProductCareKind
  title: string
  body: string
}

export const PHOTO_CAKE_CARE: ProductCareNotice = {
  kind: "photo",
  title: "Edible photo note",
  body: "The printed photo is best enjoyed the same day. It can soften or dissolve if left longer, so please collect before your event and serve soon after.",
}

/**
 * Shown under the product gallery on every cake PDP.
 * Accessories / props in photos are for presentation and may vary.
 */
export const PRODUCT_ACCESSORIES_NOTE =
  "Accessories shown in the picture are for presentation only and may differ from those supplied with your cake."

export type ProductCareInput = {
  title?: string | null
  handle?: string | null
  metadata?: Record<string, unknown> | null
  collection?: { handle?: string | null; title?: string | null } | null
  type?: { value?: string | null } | null
  categories?: Array<{ handle?: string | null; name?: string | null }> | null
}

function isTruthyMetaFlag(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value === "string") {
    const v = value.trim().toLowerCase()
    return v === "true" || v === "1" || v === "yes"
  }
  return false
}

function blobFromProduct(input: ProductCareInput): string {
  const parts: string[] = [
    input.title ?? "",
    input.handle ?? "",
    input.collection?.handle ?? "",
    input.collection?.title ?? "",
    input.type?.value ?? "",
  ]
  for (const c of input.categories ?? []) {
    parts.push(c.handle ?? "", c.name ?? "")
  }
  return parts.filter(Boolean).join(" ").toLowerCase()
}

/** Photo cakes: metadata flag, collection/type, or category handle. */
export function isPhotoCakeProduct(input: ProductCareInput): boolean {
  const meta = input.metadata ?? {}
  // Explicit opt-in always counts; category/title still show disclaimer for
  // photo-range products even when upload is disabled.
  if (isTruthyMetaFlag(meta.supports_photo_upload)) return true
  const blob = blobFromProduct(input)
  if (/\bphoto\b/.test(blob)) return true
  return (input.categories ?? []).some(
    (c) => /photo/i.test(c.handle ?? "") || /photo/i.test(c.name ?? "")
  )
}

/** Ordered care notices for product detail (photo only; accessories are separate). */
export function getProductCareNotices(
  input: ProductCareInput
): ProductCareNotice[] {
  const notices: ProductCareNotice[] = []
  if (isPhotoCakeProduct(input)) notices.push(PHOTO_CAKE_CARE)
  return notices
}
