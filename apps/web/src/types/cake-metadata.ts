/**
 * Canonical cake customization contracts for the storefront.
 *
 * Single source of truth for:
 *  - Line-item `metadata.custom_attributes` keys written at add-to-cart
 *  - Product-level metadata that drives the product-detail UI
 *  - Character limits for inscription / baker instructions
 *
 * Backend order decorator (`/admin/cake-orders`) reads these keys (plus
 * legacy capitalized aliases) via case-insensitive matching, including `jam`
 * ("Mixed Jam" | "No Jam") for the product-detail jam-filling selector.
 */

// ---------------------------------------------------------------------------
// Character limits
// ---------------------------------------------------------------------------

/** Personalised text printed/piped onto the cake surface. */
export const INSCRIPTION_MAX_LENGTH = 100

/** Free-text notes for the bakers (dietary requests, packaging, etc.). */
export const MESSAGE_MAX_LENGTH = 200

// ---------------------------------------------------------------------------
// Canonical line-item custom_attributes keys
// ---------------------------------------------------------------------------

export const CAKE_ATTR = {
  flavour: "flavour",
  servings: "servings",
  jam: "jam",
  date: "date",
  time: "time",
  message: "message",
  photo_url: "photo_url",
} as const

export type CakeAttrKey = (typeof CAKE_ATTR)[keyof typeof CAKE_ATTR]

/** Jam filling choices offered on the product detail page. */
export const JAM_OPTIONS = ["Mixed Jam", "No Jam"] as const
export type JamOption = (typeof JAM_OPTIONS)[number]
export const DEFAULT_JAM_OPTION: JamOption = "Mixed Jam"

/**
 * Shape stored under `line_item.metadata.custom_attributes`.
 * Inscription lives at top-level `metadata.inscription` (historical contract).
 */
export type LineItemCakeAttributes = {
  flavour?: string
  servings?: string
  /** "Mixed Jam" | "No Jam" (or free-form from older carts). */
  jam?: string
  date?: string
  time?: string
  message?: string
  photo_url?: string
  /**
   * Pass-through product option values that are not cake fields
   * (e.g. Size: "1kg"). Flattened into custom_attributes alongside the
   * canonical keys.
   */
  [optionKey: string]: string | undefined
}

/**
 * Full line-item metadata envelope written by `addLineItem`.
 * Everything else on the cart line (Medusa fields) is out of scope.
 */
export type LineItemCakeMetadata = {
  store_location_id?: string
  custom_attributes?: LineItemCakeAttributes
  /** Cake surface text — top-level for decorator compatibility. */
  inscription?: string
}

// ---------------------------------------------------------------------------
// Product metadata schema (read from Medusa product.metadata)
// ---------------------------------------------------------------------------

export type ProductCakeMetadata = {
  supports_inscription?: boolean | string
  supports_photo_upload?: boolean | string
  /**
   * Flavours offered when the product has no Flavor/Flavour option.
   * May be a JSON array string or a comma-separated list.
   */
  supported_flavours?: string | string[]
  /**
   * Map of size/variant key → servings label.
   * e.g. `{ "1kg": "8-10 servings", "2kg": "16-20 servings" }`
   * May be stored as a JSON string in product.metadata.
   */
  servings_map?: string | Record<string, string>
  /**
   * Comma-separated ingredient list shown on the product detail page.
   * Prefer this over the legacy `material` metadata key.
   */
  ingredients?: string
  /**
   * Legacy seed key for ingredients (seed-premium-cakes wrote here).
   * Storefront resolves ingredients from: product.material → ingredients → material.
   */
  material?: string
  allergens?: string | string[]
  storage_serving?: string
  storage_and_serving?: string
  [key: string]: unknown
}

/**
 * Resolve ingredients text for product detail.
 * Priority:
 *  1. Medusa product.material (Organize → Material)
 *  2. metadata.ingredients (canonical cake key)
 *  3. metadata.material (legacy seed / older admin writes)
 */
export function resolveIngredientsText(input: {
  material?: string | null
  metadata?: Record<string, unknown> | null
}): string | null {
  const fromField =
    typeof input.material === "string" ? input.material.trim() : ""
  if (fromField) return fromField

  const meta = input.metadata ?? {}
  for (const key of ["ingredients", "material"] as const) {
    const raw = meta[key]
    if (typeof raw === "string" && raw.trim()) return raw.trim()
    if (Array.isArray(raw)) {
      const joined = raw.map(String).map((s) => s.trim()).filter(Boolean).join(", ")
      if (joined) return joined
    }
  }
  return null
}

/**
 * Resolve allergen labels from product.metadata.allergens.
 * Accepts a comma-separated string, JSON string array, or string array.
 * Dietary tags are separate (positive claims) and are not returned here.
 */
export function resolveAllergenLabels(
  metadata?: Record<string, unknown> | null
): string[] {
  const raw = metadata?.allergens
  if (raw === undefined || raw === null) return []

  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.trim()).filter(Boolean)
  }

  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim()
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.map(String).map((s) => s.trim()).filter(Boolean)
        }
      } catch {
        // fall through to comma-split
      }
    }
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }

  return []
}

/**
 * Resolve storage & serving copy from product metadata.
 */
export function resolveStorageServingText(
  metadata?: Record<string, unknown> | null
): string | null {
  if (!metadata) return null
  for (const key of ["storage_serving", "storage_and_serving"] as const) {
    const raw = metadata[key]
    if (typeof raw === "string" && raw.trim()) return raw.trim()
  }
  return null
}

// ---------------------------------------------------------------------------
// Display labels for cart / checkout badges
// ---------------------------------------------------------------------------

export const CAKE_ATTR_LABELS: Record<string, string> = {
  flavour: "Flavour",
  servings: "Servings",
  jam: "Jam",
  date: "Collection Date",
  time: "Collection Time",
  message: "Instructions",
  photo_url: "Photo",
}

// ---------------------------------------------------------------------------
// Legacy key normalisation (old storefront wrote capitalised labels)
// ---------------------------------------------------------------------------

const LEGACY_TO_CANONICAL: Record<string, CakeAttrKey> = {
  flavour: "flavour",
  flavor: "flavour",
  "sponge flavor": "flavour",
  "sponge flavour": "flavour",
  servings: "servings",
  "number of servings": "servings",
  jam: "jam",
  "jam filling": "jam",
  "jam option": "jam",
  date: "date",
  "collection date": "date",
  time: "time",
  "collection time": "time",
  message: "message",
  "special message": "message",
  instructions: "message",
  "special instructions": "message",
  photo_url: "photo_url",
  "photo url": "photo_url",
  photo: "photo_url",
}

/**
 * Maps a free-form attribute key to a canonical cake key when known;
 * otherwise returns the original key (for pass-through options like Size).
 */
export function toCanonicalAttrKey(key: string): string {
  const normalized = key.toLowerCase().trim()
  return LEGACY_TO_CANONICAL[normalized] ?? key
}

/**
 * Whether a product option title represents sponge flavour.
 */
export function isFlavourOptionTitle(title: string): boolean {
  return /^flavou?r$/i.test(title.trim())
}

/**
 * Whether a product option title represents size / weight.
 */
export function isSizeOptionTitle(title: string): boolean {
  return /^(size|weight)$/i.test(title.trim())
}

/**
 * Product option titles that collide with cart-level fulfillment
 * (`pickup` | `delivery`). These must never be written into line-item
 * `custom_attributes` — bakers should trust `order.metadata.fulfillment_method`.
 */
export function isFulfillmentOptionTitle(title: string): boolean {
  return /^(delivery\s*method|fulfillment|shipping\s*method)$/i.test(
    title.trim()
  )
}

// ---------------------------------------------------------------------------
// Builders / parsers
// ---------------------------------------------------------------------------

/**
 * Builds a clean `custom_attributes` object using only non-empty values
 * and canonical keys. Pass-through options (Size, etc.) keep their titles.
 */
export function buildCustomAttributes(input: {
  flavour?: string
  servings?: string
  jam?: string
  date?: string
  time?: string
  message?: string
  photo_url?: string
  /** Product option selections excluding flavour (already mapped). */
  extraOptions?: Record<string, string>
}): Record<string, string> {
  const out: Record<string, string> = {}

  const set = (key: CakeAttrKey, value?: string) => {
    const trimmed = value?.trim()
    if (trimmed) out[key] = trimmed
  }

  set(CAKE_ATTR.flavour, input.flavour)
  set(CAKE_ATTR.servings, input.servings)
  set(CAKE_ATTR.jam, input.jam)
  set(CAKE_ATTR.date, input.date)
  set(CAKE_ATTR.time, input.time)
  set(CAKE_ATTR.message, input.message)
  set(CAKE_ATTR.photo_url, input.photo_url)

  if (input.extraOptions) {
    for (const [k, v] of Object.entries(input.extraOptions)) {
      if (isFlavourOptionTitle(k)) continue
      // Cart-level pickup/delivery is the source of truth — do not stamp a
      // product-option "Delivery Method: Collection" onto the line (Order #1
      // style bakers saw Collection while the order was delivery).
      if (isFulfillmentOptionTitle(k)) continue
      const trimmed = v?.trim()
      if (trimmed) out[k] = trimmed
    }
  }

  return out
}

/**
 * Normalises an arbitrary attributes bag (e.g. from a re-edit form) onto
 * canonical keys. Unknown keys are kept as pass-through.
 */
export function normalizeCustomAttributes(
  attrs: Record<string, string> | null | undefined
): Record<string, string> {
  if (!attrs) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === "") continue
    const canonical = toCanonicalAttrKey(key)
    out[canonical] = String(value).trim()
  }
  return out
}

/**
 * Replace-not-merge safe merge: starts from existing attributes, then
 * overlays updates. Both sides are normalised to canonical keys first so
 * `"Flavor"` and `"flavour"` collapse correctly.
 */
export function mergeCustomAttributes(
  existing: Record<string, string> | null | undefined,
  updates: Record<string, string> | null | undefined
): Record<string, string> {
  return {
    ...normalizeCustomAttributes(existing),
    ...normalizeCustomAttributes(updates),
  }
}

/**
 * Parse product.metadata into a typed ProductCakeMetadata view.
 */
export function parseProductCakeMetadata(
  metadata: Record<string, unknown> | null | undefined
): ProductCakeMetadata {
  if (!metadata || typeof metadata !== "object") return {}
  return metadata as ProductCakeMetadata
}

export function isTruthyMetaFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1
}

/**
 * Resolve supported flavours from a Flavor product option, falling back
 * to product.metadata.supported_flavours.
 */
export function resolveSupportedFlavours(input: {
  options?: Array<{ title: string; values?: Array<{ value: string }> }>
  metadata?: Record<string, unknown> | null
}): string[] {
  const flavourOption = (input.options ?? []).find((o) =>
    isFlavourOptionTitle(o.title)
  )
  if (flavourOption?.values?.length) {
    return flavourOption.values.map((v) => v.value).filter(Boolean)
  }

  const raw = input.metadata?.supported_flavours
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean)
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {
      // comma-separated fallback
    }
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * Resolve servings label for the active variant / selected size.
 * Priority:
 *  1. variant.metadata.servings
 *  2. product.metadata.servings_map[sizeValue]
 *  3. product.metadata.servings_map[variantTitle]
 */
export function resolveServingsForVariant(input: {
  variant?: {
    title?: string
    metadata?: Record<string, unknown> | null
    options?: Array<{ value: string; option?: { title?: string } | null }>
  } | null
  productMetadata?: Record<string, unknown> | null
}): string | null {
  const fromVariant = input.variant?.metadata?.servings
  if (typeof fromVariant === "string" && fromVariant.trim()) {
    return fromVariant.trim()
  }
  if (typeof fromVariant === "number") {
    return String(fromVariant)
  }

  const map = parseServingsMap(input.productMetadata?.servings_map)
  if (!map) return null

  const sizeValue = (input.variant?.options ?? []).find((o) =>
    isSizeOptionTitle(o.option?.title ?? "")
  )?.value

  if (sizeValue && map[sizeValue]) return map[sizeValue]
  if (input.variant?.title && map[input.variant.title]) {
    return map[input.variant.title]
  }
  return null
}

function parseServingsMap(
  raw: unknown
): Record<string, string> | null {
  if (!raw) return null
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v != null && v !== "") out[k] = String(v)
    }
    return Object.keys(out).length ? out : null
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return parseServingsMap(parsed)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Human-friendly label for a custom_attributes key (cart badges).
 */
export function labelForAttrKey(key: string): string {
  const canonical = toCanonicalAttrKey(key)
  return CAKE_ATTR_LABELS[canonical] ?? key
}

/**
 * Keys that should not be rendered as plain text badges (e.g. URLs).
 */
export function isHiddenAttrKey(key: string): boolean {
  return toCanonicalAttrKey(key) === CAKE_ATTR.photo_url
}

// ---------------------------------------------------------------------------
// Collection date/time (product-page slots → line attrs → cart metadata)
// ---------------------------------------------------------------------------

/** Product-page / line-item collection window. */
export type CollectionSlot = {
  date: string
  time: string
  label?: string
}

/** Cart-level metadata fields derived from a collection slot. */
export type CollectionSlotCartMetadata = {
  requested_pickup_date: string
  requested_pickup_time: string
  requested_pickup_label: string
  requested_pickup_iso?: string
}

type LineItemLike = {
  metadata?: {
    custom_attributes?: LineItemCakeAttributes | Record<string, string> | null
  } | null
}

/** Extract leading `HH:mm` from values like `09:00` or `09:00 – 09:30`. */
export function extractSlotStartTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{2}:\d{2})/)
  return m ? m[1] : null
}

/**
 * Read trimmed date + time from line-item `metadata.custom_attributes`.
 * Returns null unless both are non-empty.
 *
 * `time` may be a free-text range label (`09:00 – 09:30`); we keep it as the
 * display label and still return a slot so cart promotion works.
 */
export function getLineCollectionSlot(
  item: LineItemLike | null | undefined
): CollectionSlot | null {
  const attrs = item?.metadata?.custom_attributes
  if (!attrs || typeof attrs !== "object") return null
  const date =
    typeof attrs.date === "string" ? attrs.date.trim() : ""
  const time =
    typeof attrs.time === "string" ? attrs.time.trim() : ""
  if (!date || !time) return null
  const start = extractSlotStartTime(time)
  return {
    date,
    // Prefer HH:mm for machine fields; keep full string as label when range.
    time: start ?? time,
    label: time,
  }
}

/**
 * True when every line has a non-empty collection date and time
 * (cart checkout gate).
 */
export function cartItemsHaveCollectionSlots(
  items: LineItemLike[] | null | undefined
): boolean {
  if (!items?.length) return false
  return items.every((item) => getLineCollectionSlot(item) != null)
}

/**
 * Most recent line (end of list) that has a collection slot — last-item-wins
 * for cart-level `requested_pickup_*` promotion.
 */
export function getMostRecentLineCollectionSlot(
  items: LineItemLike[] | null | undefined
): CollectionSlot | null {
  if (!items?.length) return null
  for (let i = items.length - 1; i >= 0; i--) {
    const slot = getLineCollectionSlot(items[i])
    if (slot) return slot
  }
  return null
}

const HHMM_RE = /^\d{2}:\d{2}$/

/**
 * Cart metadata patch for a collection slot.
 *
 * Contract (single source of truth for bakers + checkout):
 *  - `requested_pickup_time`  → always start `HH:mm` when parseable
 *  - `requested_pickup_label` → human window (`09:00 – 09:30`) when available
 *  - `requested_pickup_iso`   → `${date}T${HH:mm}:00` when start is HH:mm
 *
 * Never leave a stale clock time (e.g. `17:00`) when the line label says
 * `12:30 – 13:00` — callers should re-run this from line slots at checkout.
 */
export function collectionSlotToCartMetadata(
  slot: CollectionSlot
): CollectionSlotCartMetadata {
  const date = slot.date.trim()
  const rawTime = slot.time.trim()
  const rawLabel = slot.label?.trim() || rawTime
  const start =
    extractSlotStartTime(rawTime) ||
    extractSlotStartTime(rawLabel) ||
    rawTime
  const label =
    rawLabel.includes("–") || rawLabel.includes("-") || rawLabel !== start
      ? rawLabel
      : start
  const meta: CollectionSlotCartMetadata = {
    requested_pickup_date: date,
    requested_pickup_time: start,
    requested_pickup_label: label,
  }
  if (HHMM_RE.test(start)) {
    meta.requested_pickup_iso = `${date}T${start}:00`
  }
  return meta
}
