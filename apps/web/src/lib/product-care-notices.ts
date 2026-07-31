/**
 * Product care / disclaimer notices for photo cakes, chocolate decoration, etc.
 * Prefer explicit metadata flags; fall back to title/handle/category heuristics.
 */

export type ProductCareKind = "photo" | "chocolate"

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

export const CHOCOLATE_CAKE_CARE: ProductCareNotice = {
  kind: "chocolate",
  title: "Chocolate care",
  body: "Chocolate drips, shards, and decorations can soften or melt in warmth. Keep cool in transit and out of direct sun; refrigerate if not serving soon.",
}

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

function isFalsyMetaFlag(value: unknown): boolean {
  if (value === false || value === 0) return true
  if (typeof value === "string") {
    const v = value.trim().toLowerCase()
    return v === "false" || v === "0" || v === "no"
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

const CHOCOLATE_HEURISTIC =
  /\b(chocolate|choc\b|ganache|cocoa|truffle|drip\s*cake|chocolate\s*drip|choco)\b/i

/** Chocolate decoration / sponge care candidates. */
export function isChocolateCareProduct(input: ProductCareInput): boolean {
  const meta = input.metadata ?? {}
  if (isTruthyMetaFlag(meta.has_chocolate)) return true
  if (isFalsyMetaFlag(meta.has_chocolate)) return false

  const flags = meta.care_flags
  if (Array.isArray(flags) && flags.map(String).some((f) => /chocolate/i.test(f))) {
    return true
  }
  if (typeof flags === "string" && /chocolate/i.test(flags)) return true

  return CHOCOLATE_HEURISTIC.test(blobFromProduct(input))
}

/** Ordered care notices for product detail / cart. */
export function getProductCareNotices(
  input: ProductCareInput
): ProductCareNotice[] {
  const notices: ProductCareNotice[] = []
  if (isPhotoCakeProduct(input)) notices.push(PHOTO_CAKE_CARE)
  if (isChocolateCareProduct(input)) notices.push(CHOCOLATE_CAKE_CARE)
  return notices
}
