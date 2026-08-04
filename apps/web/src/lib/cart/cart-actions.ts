/**
 * src/lib/cart/cart-actions.ts
 *
 * Thin async functions for interacting with the Medusa Store Cart API.
 * These are intentionally framework-agnostic (no React hooks) so they can be
 * called from both Client Components and Server Actions.
 *
 * All requests automatically include:
 *   - `x-publishable-api-key`   (from env)
 *   - `x-franchise-id`          (from cookie, via getMedusaHeadersSync)
 *
 * Cart-level metadata we inject:
 *   - `store_location_id`        : the selected_store_location_id cookie value
 *   - `fulfillment_method`       : "pickup" | "delivery"
 *   - `requested_pickup_time`    : ISO string of the selected time slot
 */

import { getMedusaHeadersSync } from "@/lib/medusa/headers"
import { fetchStoreSlots } from "@/lib/data/logistics"
import { merchandiseSubtotalForDelivery } from "@/lib/cart/cart-totals"
import {
  FRANCHISE_COOKIE,
  getBrowserCookie,
  STORE_ID_COOKIE,
} from "@/lib/store-cookies"
import {
  CAKE_ATTR,
  collectionSlotToCartMetadata,
  extractSlotStartTime,
  getMostRecentLineCollectionSlot,
  mergeCustomAttributes,
  normalizeCustomAttributes,
  type CollectionSlot,
  type LineItemCakeMetadata,
} from "@/types/cake-metadata"

const BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "http://localhost:9000"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CartLineItemMetadata extends LineItemCakeMetadata {
  [key: string]: unknown
}

export interface MedusaCartItemProduct {
  id?: string
  handle?: string | null
  title?: string | null
  categories?: Array<{
    id?: string
    name?: string | null
    handle?: string | null
  }> | null
}

export interface MedusaCartItem {
  id: string
  variant_id: string | null
  product_id: string | null
  title: string
  variant_title?: string | null
  thumbnail?: string | null
  quantity: number
  unit_price: number
  subtotal: number
  currency_code: string
  metadata?: CartLineItemMetadata | null
  /** Expanded when getCart requests product + categories (offline scrub). */
  product?: MedusaCartItemProduct | null
}

export interface MedusaCartAddress {
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  postal_code?: string | null
  phone?: string | null
  country_code?: string | null
  province?: string | null
  company?: string | null
}

export interface MedusaCart {
  id: string
  customer_id?: string | null
  email?: string | null
  currency_code: string
  total: number
  subtotal: number
  tax_total: number
  shipping_total: number
  discount_total?: number
  items: MedusaCartItem[]
  shipping_address?: MedusaCartAddress | null
  billing_address?: MedusaCartAddress | null
  metadata?: Record<string, unknown> | null
  sales_channel_id?: string | null
  promotions?: Array<{ id: string; code?: string | null }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function cartFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = getMedusaHeadersSync()
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message =
      (body as { message?: string }).message ??
      `Cart request failed: ${res.status} ${res.statusText}`
    throw new Error(message)
  }

  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Cart CRUD
// ---------------------------------------------------------------------------

/**
 * Creates a new Medusa cart scoped to the active franchise Sales Channel.
 * Stores `store_location_id` in cart metadata for downstream fulfillment routing.
 */
export async function createCart(options?: {
  storeLocationId?: string
}): Promise<MedusaCart> {
  const storeLocationId =
    options?.storeLocationId ?? getBrowserCookie(STORE_ID_COOKIE) ?? undefined
  const franchiseId = getBrowserCookie(FRANCHISE_COOKIE) ?? undefined

  const metadata: Record<string, unknown> = {}
  if (storeLocationId) metadata.store_location_id = storeLocationId
  if (franchiseId) metadata.franchise_id = franchiseId

  const { cart } = await cartFetch<{ cart: MedusaCart }>("/store/carts", {
    method: "POST",
    body: JSON.stringify({
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    }),
  })

  return cart
}

/**
 * Retrieves a cart by ID. Returns null if not found or if the cart belongs
 * to a different franchise (cross-tenant guard).
 *
 * `customer_id` is requested on top of the default fields so callers can
 * verify cart ownership against the active customer session.
 */
export async function getCart(cartId: string): Promise<MedusaCart | null> {
  try {
    // +customer_id for session ownership checks; *promotions so the cart
    // page can show real applied codes (not a client-side fake discount).
    // email + *shipping_address so checkout can pre-fill from a cart that
    // already has contact/address (e.g. after a previous prepare attempt).
    const fields = [
      "+customer_id",
      "+email",
      "+discount_total",
      "+shipping_total",
      // Free-over merchandise SSOT: item-only totals (exclude shipping/tax).
      "+item_subtotal",
      "+item_discount_total",
      "+shipping_subtotal",
      "*shipping_address",
      "*promotions",
      // Offline-order scrub: need category handles on line products
      "*items",
      "*items.product",
      "*items.product.categories",
    ].join(",")
    const { cart } = await cartFetch<{ cart: MedusaCart }>(
      `/store/carts/${cartId}?fields=${encodeURIComponent(fields)}`
    )
    return cart
  } catch {
    return null
  }
}

/**
 * Adds a line item to the cart.
 * Attaches `store_location_id`, canonical `custom_attributes`, and optional
 * `inscription` into the line item metadata so cake fields survive to the
 * order. Attribute keys are normalised to the Phase-0 contract
 * (`flavour|servings|jam|date|time|message|photo_url`).
 *
 * When `existingCustomAttributes` is provided (re-add / edit flows), updates
 * are **spread-merged** so partial writes cannot wipe flavour/date/etc.
 */
export async function addLineItem(
  cartId: string,
  params: {
    variantId: string
    quantity: number
    storeLocationId?: string
    customAttributes?: Record<string, string>
    /** Existing attributes to spread under (replace-not-merge mitigation). */
    existingCustomAttributes?: Record<string, string> | null
    inscription?: string
  }
): Promise<MedusaCart> {
  const {
    variantId,
    quantity,
    storeLocationId,
    customAttributes,
    existingCustomAttributes,
    inscription,
  } = params

  const metadata: CartLineItemMetadata = {}
  if (storeLocationId) metadata.store_location_id = storeLocationId

  const merged = mergeCustomAttributes(
    existingCustomAttributes,
    customAttributes
  )
  if (Object.keys(merged).length > 0) {
    metadata.custom_attributes = merged
  }
  if (inscription?.trim()) metadata.inscription = inscription.trim()

  const { cart } = await cartFetch<{ cart: MedusaCart }>(
    `/store/carts/${cartId}/line-items`,
    {
      method: "POST",
      body: JSON.stringify({
        variant_id: variantId,
        quantity,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      }),
    }
  )
  return cart
}

/**
 * Updates the quantity of an existing line item.
 * Quantity-only writes leave line-item metadata intact (Medusa partial update).
 */
export async function updateLineItem(
  cartId: string,
  lineItemId: string,
  quantity: number
): Promise<MedusaCart> {
  const { cart } = await cartFetch<{ cart: MedusaCart }>(
    `/store/carts/${cartId}/line-items/${lineItemId}`,
    {
      method: "POST",
      body: JSON.stringify({ quantity }),
    }
  )
  return cart
}

/**
 * Updates line-item metadata with spread-merge on `custom_attributes`.
 * Use this for post-add edits (e.g. changing collection time) so a partial
 * write cannot wipe other cake fields.
 *
 * Medusa's StoreUpdateCartLineItem requires `quantity` on every POST to
 * `/store/carts/:id/line-items/:line_id` — even metadata-only updates. We
 * re-send the current line quantity so collection-slot stamps succeed.
 */
export async function updateLineItemMetadata(
  cartId: string,
  lineItemId: string,
  params: {
    customAttributes?: Record<string, string>
    existingCustomAttributes?: Record<string, string> | null
    inscription?: string | null
  }
): Promise<MedusaCart> {
  // Fetch current cart so we can spread existing line metadata if the caller
  // did not pass existingCustomAttributes explicitly.
  const current = await getCart(cartId)
  const line = current?.items.find((i) => i.id === lineItemId)
  if (!line) {
    throw new Error("Cart line item not found. Please refresh and try again.")
  }
  const existingAttrs =
    params.existingCustomAttributes ??
    (line.metadata?.custom_attributes as Record<string, string> | undefined) ??
    null

  const metadata: CartLineItemMetadata = {
    ...(line.metadata ?? {}),
  }

  if (params.customAttributes) {
    metadata.custom_attributes = mergeCustomAttributes(
      existingAttrs,
      params.customAttributes
    )
  } else if (existingAttrs) {
    metadata.custom_attributes = normalizeCustomAttributes(existingAttrs)
  }

  if (params.inscription !== undefined) {
    if (params.inscription?.trim()) {
      metadata.inscription = params.inscription.trim()
    } else {
      delete metadata.inscription
    }
  }

  // quantity is required by Medusa even when only metadata changes.
  const quantity = line.quantity > 0 ? line.quantity : 1

  const { cart } = await cartFetch<{ cart: MedusaCart }>(
    `/store/carts/${cartId}/line-items/${lineItemId}`,
    {
      method: "POST",
      body: JSON.stringify({ quantity, metadata }),
    }
  )
  return cart
}

/**
 * Order-level collection window: write cart.metadata.requested_pickup_* and
 * stamp every line's custom_attributes.date/time so bakers + checkout agree.
 */
export async function applyCollectionSlotToCart(
  cartId: string,
  slot: CollectionSlot,
  existingMetadata?: Record<string, unknown> | null
): Promise<MedusaCart> {
  const current = await getCart(cartId)
  if (!current) {
    throw new Error("Your cart could not be loaded. Please refresh and try again.")
  }

  const displayTime = (slot.label?.trim() || slot.time).trim()
  const lineAttrs = {
    [CAKE_ATTR.date]: slot.date.trim(),
    [CAKE_ATTR.time]: displayTime,
  }

  let cart = current
  for (const item of current.items) {
    cart = await updateLineItemMetadata(cartId, item.id, {
      customAttributes: lineAttrs,
      existingCustomAttributes:
        (item.metadata?.custom_attributes as Record<string, string> | undefined) ??
        null,
    })
  }

  cart = await updateCartMetadata(cartId, {
    ...(existingMetadata ?? cart.metadata ?? {}),
    ...collectionSlotToCartMetadata(slot),
  })

  return cart
}

/**
 * Removes a line item from the cart.
 */
export async function removeLineItem(
  cartId: string,
  lineItemId: string
): Promise<MedusaCart> {
  const { parent } = await cartFetch<{ parent: MedusaCart }>(
    `/store/carts/${cartId}/line-items/${lineItemId}`,
    { method: "DELETE" }
  )
  return parent
}

/**
 * Updates cart-level metadata (fulfillment_method, requested_pickup_time, etc.)
 * without touching line items.
 */
export async function updateCartMetadata(
  cartId: string,
  metadata: Record<string, unknown>
): Promise<MedusaCart> {
  const { cart } = await cartFetch<{ cart: MedusaCart }>(
    `/store/carts/${cartId}`,
    {
      method: "POST",
      body: JSON.stringify({ metadata }),
    }
  )
  return cart
}

/**
 * Patches cart fields (metadata and/or shipping_address). Used to keep the
 * delivery postcode on Medusa's shipping address in lockstep with
 * metadata.delivery_postcode so cart → checkout cannot drift.
 */
export async function updateCartFields(
  cartId: string,
  payload: {
    metadata?: Record<string, unknown>
    shipping_address?: Partial<MedusaCartAddress>
    email?: string
  }
): Promise<MedusaCart> {
  const { cart } = await cartFetch<{ cart: MedusaCart }>(
    `/store/carts/${cartId}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  )
  return cart
}

/**
 * Attaches the preferred shipping option for pickup or local delivery so
 * cart.shipping_total / cart.total become payment truth (not UI-only fees).
 */
export async function applyPreferredShippingMethod(
  cartId: string,
  fulfillmentMethod: "pickup" | "delivery",
  storeLocationId?: string | null
): Promise<MedusaCart> {
  const options = await listCartShippingOptions(cartId)
  if (!options.length) {
    throw new Error(
      "No delivery or collection option is available for this address."
    )
  }

  const preferred =
    fulfillmentMethod === "pickup"
      ? options.find((o) => /pick.?up|collect/i.test(o.name))
      : options.find((o) => /local.?deliver|local delivery/i.test(o.name)) ||
        options.find(
          (o) => /deliver/i.test(o.name) && !/standard|express/i.test(o.name)
        )

  const shippingBody: Record<string, unknown> = {
    option_id: (preferred ?? options[0]).id,
  }
  if (storeLocationId) {
    shippingBody.data = { store_location_id: storeLocationId }
  }

  const { cart } = await cartFetch<{ cart: MedusaCart }>(
    `/store/carts/${cartId}/shipping-methods`,
    {
      method: "POST",
      body: JSON.stringify(shippingBody),
    }
  )
  return cart
}

/**
 * Writes the cart-page delivery quote into the cart as the single source of
 * truth for postcode + fee metadata, stamps shipping_address.postal_code,
 * and attaches the local-delivery shipping method so cart.total includes it.
 */
export async function syncDeliveryQuoteToCart(
  cartId: string,
  params: {
    postcode: string
    fee: number
    distance_mi?: number | null
    deliverable: boolean
    storeLocationId?: string | null
    existingMetadata?: Record<string, unknown> | null
  }
): Promise<MedusaCart> {
  const postcode = params.postcode.trim()
  const current = params.existingMetadata ?? (await getCart(cartId))?.metadata
  const metadata: Record<string, unknown> = {
    ...(current ?? {}),
    fulfillment_method: "delivery",
    delivery_fee: params.deliverable ? params.fee : 0,
    delivery_postcode: postcode,
    delivery_deliverable: params.deliverable,
  }
  if (params.distance_mi != null) {
    metadata.delivery_distance_mi = params.distance_mi
    // Drop legacy km key so UI does not show stale units.
    delete metadata.delivery_distance_km
  }
  if (params.storeLocationId) {
    metadata.store_location_id = params.storeLocationId
  }

  // Preserve any existing address fields; only stamp the postcode + country.
  const existing = await getCart(cartId)
  const prevAddr = existing?.shipping_address ?? {}

  await updateCartFields(cartId, {
    metadata,
    shipping_address: {
      first_name: prevAddr.first_name ?? undefined,
      last_name: prevAddr.last_name ?? undefined,
      address_1: prevAddr.address_1 ?? undefined,
      address_2: prevAddr.address_2 ?? undefined,
      city: prevAddr.city ?? undefined,
      phone: prevAddr.phone ?? undefined,
      province: prevAddr.province ?? undefined,
      company: prevAddr.company ?? undefined,
      postal_code: postcode,
      country_code: prevAddr.country_code ?? "gb",
    },
  })

  // Attach shipping method so cart.shipping_total is payment truth. If this
  // fails (e.g. options not ready until full address), metadata.delivery_fee
  // still lets cart/checkout show the same quoted total; prepareCartForCheckout
  // re-attaches at place-order with the full address.
  try {
    return await applyPreferredShippingMethod(
      cartId,
      params.deliverable ? "delivery" : "pickup",
      params.storeLocationId
    )
  } catch {
    const cart = await getCart(cartId)
    if (!cart) throw new Error("Your cart could not be found.")
    return cart
  }
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

/**
 * Applies a promotion code to the cart via Medusa's promotions engine.
 * Throws if the code is invalid/inactive (Medusa returns the cart unchanged,
 * so we detect failure by checking the applied promotions).
 */
export async function applyPromoCode(
  cartId: string,
  code: string
): Promise<MedusaCart> {
  const { cart } = await cartFetch<{ cart: MedusaCart }>(
    `/store/carts/${cartId}/promotions`,
    {
      method: "POST",
      body: JSON.stringify({ promo_codes: [code.trim()] }),
    }
  )

  const applied = (cart.promotions ?? []).some(
    (p) => p.code?.toLowerCase() === code.trim().toLowerCase()
  )
  if (!applied) {
    throw new Error("This discount code is invalid or has expired.")
  }

  return cart
}

/**
 * Removes a previously applied promotion code from the cart.
 */
export async function removePromoCode(
  cartId: string,
  code: string
): Promise<MedusaCart> {
  const { cart } = await cartFetch<{ cart: MedusaCart }>(
    `/store/carts/${cartId}/promotions`,
    {
      method: "DELETE",
      body: JSON.stringify({ promo_codes: [code.trim()] }),
    }
  )
  return cart
}

// ---------------------------------------------------------------------------
// Checkout / order placement
// ---------------------------------------------------------------------------

export interface MedusaOrder {
  id: string
  display_id: number
  email?: string | null
  total?: number
  currency_code?: string
}

export interface CheckoutDetails {
  email: string
  phone?: string
  first_name: string
  last_name: string
  address_1: string
  address_2?: string
  city: string
  postal_code: string
  country_code?: string
  /** Free-text note for the bakers — stored on order metadata. */
  notes?: string
}

interface ShippingOption {
  id: string
  name: string
  amount?: number
}

/**
 * Lists the shipping options servable for the cart's current address/region.
 */
export async function listCartShippingOptions(
  cartId: string
): Promise<ShippingOption[]> {
  const { shipping_options } = await cartFetch<{
    shipping_options: ShippingOption[]
  }>(`/store/shipping-options?cart_id=${encodeURIComponent(cartId)}`)
  return shipping_options ?? []
}

/** Payment provider identifiers registered on the Medusa backend. */
export const SYSTEM_PROVIDER_ID = "pp_system_default"
export const PAYPAL_PROVIDER_ID = "pp_paypal_paypal"

export interface MedusaPaymentSession {
  id: string
  provider_id: string
  /** Provider-specific payload — for PayPal, `data.id` is the PayPal order ID. */
  data?: Record<string, unknown> | null
}

/**
 * Checkout step 1 of 4 — saves contact details, shipping/billing address and
 * baker notes onto the cart, then attaches a shipping method (prefers a
 * "pickup" option when the cart's fulfillment_method is pickup).
 *
 * For delivery carts we re-quote the backend delivery-fee endpoint with the
 * checkout postcode so the charge path cannot drift from a stale cart-page
 * quote, and we refuse to proceed when the address is outside the radius.
 * The fee that is *charged* is Medusa's shipping method amount (Local
 * Delivery / Store Pickup) — cart.total after this step is payment truth.
 */
export async function prepareCartForCheckout(
  cartId: string,
  details: CheckoutDetails
): Promise<MedusaCart> {
  const current = await getCart(cartId)
  if (!current) throw new Error("Your cart could not be found.")
  if (!current.items.length) throw new Error("Your cart is empty.")

  const address = {
    first_name: details.first_name,
    last_name: details.last_name,
    address_1: details.address_1,
    address_2: details.address_2 || undefined,
    city: details.city,
    postal_code: details.postal_code,
    country_code: details.country_code ?? "gb",
    phone: details.phone || undefined,
  }

  // Prefer cart metadata, then cookie, then any line-item bakery stamp.
  // Cart-level store_location_id is sometimes missing even when the cookie
  // and line items are set (e.g. restored account carts / cookie-only pick).
  const cookieStoreId = getBrowserCookie(STORE_ID_COOKIE)
  const lineStoreId = current.items
    .map((i) => i.metadata?.store_location_id)
    .find((id): id is string => typeof id === "string" && id.length > 0)

  const storeLocationId =
    (typeof current.metadata?.store_location_id === "string" &&
      current.metadata.store_location_id) ||
    cookieStoreId ||
    lineStoreId ||
    null

  // Default to pickup when unset — previously a missing fulfillment_method
  // fell through to the delivery shipping option and blew up price calc.
  const rawMethod = current.metadata?.fulfillment_method
  const fulfillmentMethod: "pickup" | "delivery" =
    rawMethod === "delivery" ? "delivery" : "pickup"

  // Order-level collection window: prefer cart metadata (set on cart page),
  // fall back to line stamps. Re-promote so checkout/order routing agree.
  const lineSlot = getMostRecentLineCollectionSlot(current.items)
  const metaDate =
    typeof current.metadata?.requested_pickup_date === "string"
      ? current.metadata.requested_pickup_date
      : ""
  const metaTime =
    typeof current.metadata?.requested_pickup_time === "string"
      ? current.metadata.requested_pickup_time
      : ""
  const metaLabel =
    typeof current.metadata?.requested_pickup_label === "string"
      ? current.metadata.requested_pickup_label
      : ""
  const cartSlot =
    metaDate && metaTime
      ? {
          date: metaDate,
          time: metaTime,
          label: metaLabel || metaTime,
        }
      : null
  const resolvedSlot = cartSlot ?? lineSlot
  const slotMeta = resolvedSlot
    ? collectionSlotToCartMetadata(resolvedSlot)
    : {}

  // Re-validate delivery on the server-side fee API (not client-only metadata).
  let deliveryMeta: Record<string, unknown> = {}
  if (fulfillmentMethod === "delivery") {
    if (!storeLocationId) {
      throw new Error(
        "Choose a bakery on the map before checking out for delivery."
      )
    }
    // Merchandise after discounts, before tax & delivery (free-over SSOT —
    // never inflate with attached shipping; never tax-inclusive).
    const merchandiseSubtotal = merchandiseSubtotalForDelivery(current)
    const params = new URLSearchParams({
      postcode: details.postal_code.trim(),
      merchandise_subtotal: String(merchandiseSubtotal),
    })
    const feeRes = await cartFetch<{
      deliverable: boolean
      fee: number
      distance_mi?: number
      message?: string
    }>(
      `/store/stores/${encodeURIComponent(storeLocationId)}/delivery-fee?${params}`
    )
    if (!feeRes.deliverable) {
      throw new Error(
        feeRes.message ??
          "Sorry — this address is outside the delivery radius for your chosen bakery."
      )
    }
    deliveryMeta = {
      delivery_fee: feeRes.fee,
      delivery_postcode: details.postal_code.trim(),
      delivery_distance_mi: feeRes.distance_mi,
      delivery_deliverable: true,
    }
  }

  await updateCartFields(cartId, {
    email: details.email,
    shipping_address: address,
    metadata: {
      // Preserve existing keys (store_location_id, fulfillment_method, …) —
      // Medusa replaces the metadata object wholesale on update.
      ...(current.metadata ?? {}),
      fulfillment_method: fulfillmentMethod,
      ...(storeLocationId ? { store_location_id: storeLocationId } : {}),
      ...slotMeta,
      ...deliveryMeta,
      ...(details.notes?.trim()
        ? { notes_for_baker: details.notes.trim() }
        : {}),
    },
  })

  // Also stamp billing to match shipping (prepare path historically did this).
  await cartFetch<{ cart: MedusaCart }>(`/store/carts/${cartId}`, {
    method: "POST",
    body: JSON.stringify({ billing_address: address }),
  })

  // Forward store_location_id on the shipping method so the calculated
  // delivery provider can price even when Medusa omits cart.metadata from
  // the calculatePrice context (core field allow-list).
  return applyPreferredShippingMethod(
    cartId,
    fulfillmentMethod,
    storeLocationId
  )
}

/**
 * Client-side collection slot gate (no grace — server keeps the 2-minute grace
 * on complete only). Used before payment starts and again before complete.
 */
export async function assertCartCollectionSlotStillValid(
  cartId: string
): Promise<void> {
  const cart = (await getCart(cartId)) as MedusaCart | null
  if (!cart) {
    throw new Error("Your cart could not be loaded. Please refresh and try again.")
  }

  const meta = (cart.metadata ?? {}) as Record<string, unknown>
  const lineSlot = getMostRecentLineCollectionSlot(cart.items)
  const date =
    (typeof meta.requested_pickup_date === "string" &&
      meta.requested_pickup_date) ||
    lineSlot?.date ||
    ""
  const rawTime =
    (typeof meta.requested_pickup_time === "string" &&
      meta.requested_pickup_time) ||
    lineSlot?.time ||
    lineSlot?.label ||
    ""
  const time = extractSlotStartTime(rawTime) || rawTime.slice(0, 5)
  const storeId =
    (typeof meta.store_location_id === "string" && meta.store_location_id) ||
    cart.items
      .map((i) => i.metadata?.store_location_id)
      .find((id): id is string => typeof id === "string" && id.length > 0) ||
    getBrowserCookie(STORE_ID_COOKIE) ||
    ""

  if (!storeId) {
    throw new Error(
      "Select a bakery location before placing your order. Return to the cart or product page."
    )
  }
  if (!date || !time || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error(
      "A collection date and time slot are required. Please pick a slot on the product or cart page."
    )
  }

  let slotsResponse
  try {
    slotsResponse = await fetchStoreSlots(storeId, date)
  } catch {
    // If the slots API is briefly unavailable, let the server decide at complete.
    // Still block obviously missing local data above.
    return
  }

  const lead =
    typeof slotsResponse.lead_time_hours === "number"
      ? slotsResponse.lead_time_hours
      : 24
  const kitchenBusy = Boolean(slotsResponse.kitchen_busy)
  const match = (slotsResponse.slots ?? []).find((s) => s.time === time)

  if (!match) {
    throw new Error(
      "The selected collection time is not available. Please pick another slot on the product or cart page."
    )
  }

  if (!match.is_bookable) {
    if (
      match.unbookable_reason === "capacity" ||
      match.available_capacity <= 0
    ) {
      throw new Error(
        "This collection slot is full. Please pick another time on the product or cart page."
      )
    }
    const hoursLabel = lead === 1 ? "1 hour" : `${lead} hours`
    if (kitchenBusy && lead > 0) {
      throw new Error(
        `Kitchen is busy — orders need at least ${hoursLabel} notice. Please pick a later collection slot on the product or cart page.`
      )
    }
    if (lead > 0) {
      throw new Error(
        `This bakery needs at least ${hoursLabel} notice. Please pick a later collection slot on the product or cart page.`
      )
    }
    throw new Error(
      "The selected collection slot is no longer available. Please pick another time on the product or cart page."
    )
  }

  // Absolute lead-time check (no grace on the client).
  const slotStart = new Date(`${date}T${time}:00`).getTime()
  const cutoff = Date.now() + lead * 60 * 60 * 1000
  if (!Number.isNaN(slotStart) && slotStart < cutoff) {
    const hoursLabel = lead === 1 ? "1 hour" : `${lead} hours`
    if (kitchenBusy && lead > 0) {
      throw new Error(
        `Kitchen is busy — orders need at least ${hoursLabel} notice. Please pick a later collection slot on the product or cart page.`
      )
    }
    if (lead > 0) {
      throw new Error(
        `This bakery needs at least ${hoursLabel} notice. Please pick a later collection slot on the product or cart page.`
      )
    }
    throw new Error(
      "The selected collection slot is no longer available. Please pick another time on the product or cart page."
    )
  }
}

/**
 * Checkout step 2 of 4 — creates (or returns the existing) payment collection
 * for the cart. Medusa keys payment collections by cart, so calling this twice
 * for the same cart is safe.
 *
 * Validates the collection slot first so shoppers never start PayPal with a
 * dead busy/lead/full slot.
 */
export async function createPaymentCollection(
  cartId: string
): Promise<{ id: string }> {
  await assertCartCollectionSlotStillValid(cartId)

  const { payment_collection } = await cartFetch<{
    payment_collection: { id: string }
  }>("/store/payment-collections", {
    method: "POST",
    body: JSON.stringify({ cart_id: cartId }),
  })
  return payment_collection
}

/**
 * Checkout step 3 of 4 — initialises a payment session on the collection with
 * the given provider and returns that session. For PayPal
 * (`pp_paypal_paypal`) the provider creates a PayPal order server-side and
 * `session.data.id` carries the PayPal order ID the buttons SDK needs.
 *
 * Smart Buttons contract: session.data.status must not be PAYER_ACTION_REQUIRED
 * (that is redirect-mode and hangs the JS SDK spinner). See backend
 * `src/modules/paypal/order-contract.ts`.
 */
export async function initPaymentSession(
  paymentCollectionId: string,
  providerId: string
): Promise<MedusaPaymentSession> {
  const { payment_collection } = await cartFetch<{
    payment_collection: {
      id: string
      payment_sessions?: MedusaPaymentSession[]
    }
  }>(`/store/payment-collections/${paymentCollectionId}/payment-sessions`, {
    method: "POST",
    body: JSON.stringify({ provider_id: providerId }),
  })

  const session = (payment_collection.payment_sessions ?? []).find(
    (s) => s.provider_id === providerId
  )
  if (!session) {
    throw new Error(
      "The payment session could not be initialised. Please try again."
    )
  }

  return session
}

/**
 * Extracts the PayPal order id for the JS SDK Smart Buttons `createOrder`
 * callback. Rejects redirect-mode sessions so the UI shows an error instead
 * of an infinite spinner.
 */
export function extractSmartButtonsOrderId(
  session: MedusaPaymentSession
): string {
  const data = session.data ?? {}
  const status = String(data.status ?? "").toUpperCase()
  if (status === "PAYER_ACTION_REQUIRED") {
    throw new Error(
      "PayPal returned a redirect-mode order that Smart Buttons cannot open. " +
        "Please try again or choose a different payment method."
    )
  }

  const paypalOrderId = data.id
  if (typeof paypalOrderId !== "string" || !paypalOrderId) {
    throw new Error(
      "PayPal did not return an order reference. Please try again."
    )
  }
  return paypalOrderId
}

/**
 * Gets the PayPal-hosted approval URL for the full-page checkout flow.
 * Redirect mode is deliberately separate from Smart Buttons: feeding a
 * PAYER_ACTION_REQUIRED session to the JS SDK is what causes its permanent
 * loading state.
 */
export function extractPaypalRedirectUrl(session: MedusaPaymentSession): string {
  const data = session.data ?? {}
  const status = String(data.status ?? "").toUpperCase()
  if (status !== "PAYER_ACTION_REQUIRED") {
    throw new Error(
      "PayPal did not create a redirect checkout. Please try again."
    )
  }

  const links = Array.isArray(data.links) ? data.links : []
  const approval = links.find((link): link is { rel?: unknown; href?: unknown } =>
    typeof link === "object" &&
    link !== null &&
    (link as { rel?: unknown }).rel !== undefined &&
    ["payer-action", "approve"].includes(
      String((link as { rel: unknown }).rel).toLowerCase()
    )
  )
  const href = approval?.href
  if (typeof href !== "string" || !href) {
    throw new Error("PayPal did not return a checkout link. Please try again.")
  }

  let url: URL
  try {
    url = new URL(href)
  } catch {
    throw new Error("PayPal returned an invalid checkout link. Please try again.")
  }
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "paypal.com" && !url.hostname.endsWith(".paypal.com"))
  ) {
    throw new Error("PayPal returned an unsafe checkout link. Please try again.")
  }
  return url.toString()
}

/**
 * Checkout step 4 of 4 — completes the cart. Medusa captures the pending
 * payment session (for PayPal this triggers Orders.capture) and creates the
 * order. Throws with Medusa's error message when the cart cannot complete
 * (e.g. payment not authorised); callers should surface that to the shopper.
 */
export async function completeCartOrder(cartId: string): Promise<MedusaOrder> {
  // Soft pre-check (lead + bookable + capacity). Server still hard-enforces
  // with a 2-minute lead grace for PayPal redirect latency.
  try {
    await assertCartCollectionSlotStillValid(cartId)
  } catch (err) {
    if (err instanceof Error) {
      // Re-throw customer-facing validation errors; never swallow them.
      throw err
    }
  }

  const result = await cartFetch<
    | { type: "order"; order: MedusaOrder }
    | { type: "cart"; cart: MedusaCart; error?: { message?: string } }
  >(`/store/carts/${cartId}/complete`, { method: "POST" })

  if (result.type !== "order") {
    throw new Error(
      result.error?.message ??
        "The order could not be completed. Please try again."
    )
  }

  return result.order
}

/**
 * Completes the checkout end-to-end with the system provider (pay in store /
 * on collection) so the order lands in Medusa and the bakery admin. Kept as a
 * convenience wrapper over the four composable steps above; the PayPal flow
 * calls those steps individually because the PayPal buttons SDK sits between
 * session init and cart completion. Line-item metadata (flavour, servings,
 * collection date/time, message, inscription) carries over to the order
 * automatically.
 */
export async function placeOrder(
  cartId: string,
  details: CheckoutDetails,
  providerId: string = SYSTEM_PROVIDER_ID
): Promise<MedusaOrder> {
  await prepareCartForCheckout(cartId, details)
  const paymentCollection = await createPaymentCollection(cartId)
  await initPaymentSession(paymentCollection.id, providerId)
  return completeCartOrder(cartId)
}

// ---------------------------------------------------------------------------
// Inventory check
// ---------------------------------------------------------------------------

export interface InventoryCheckResult {
  all_sufficient: boolean
  /** Set by the backend when checkout must be blocked for a non-stock reason
   *  (e.g. "STORE_HAS_NO_STOCK_LOCATION" for a misconfigured branch). */
  reason?: string
  /** Human-readable explanation accompanying `reason`. */
  message?: string
  items: Array<{
    variant_id: string | null
    requested_quantity: number
    available_quantity: number
    is_sufficient: boolean
  }>
}

/**
 * Calls the server-side inventory check endpoint.
 * Returns null on failure (treat as sufficient to avoid blocking checkout
 * when inventory service is temporarily unavailable).
 */
export async function checkCartInventory(
  cartId: string,
  storeLocationId: string
): Promise<InventoryCheckResult | null> {
  try {
    const result = await cartFetch<InventoryCheckResult>(
      "/store/cart-inventory-check",
      {
        method: "POST",
        body: JSON.stringify({
          cart_id: cartId,
          store_location_id: storeLocationId,
        }),
      }
    )
    return result
  } catch {
    return null
  }
}
