/**
 * @file GET /admin/cake-orders
 * @description Bakery-facing order feed. Returns orders enriched with the
 * cake-specific data the storefront captures at add-to-cart time (sponge
 * flavour, servings, collection date/time, special message, inscription) plus
 * the fulfilling StoreLocation, so the bakery owner sees exactly what to bake,
 * for whom, and when — without digging through raw JSON metadata.
 *
 * Tenant scoping mirrors the native /admin/orders middlewares:
 *   Tier 1 (franchise): orders are filtered to the sales channels linked to
 *     the caller's franchise(s) via the franchise-sales-channel link. Super
 *     admins (no franchise-user link) see everything.
 *   Tier 2 (store): store-scoped users (store-location-user link) are further
 *     restricted to orders linked to their StoreLocation(s).
 *
 * Query params:
 *   - order_id  : return a single enriched order (used by the order-detail widget)
 *   - date      : YYYY-MM-DD — only orders with an item collected on that date
 *   - limit     : page size (default 50, max 200)
 *   - offset    : pagination offset
 */

import type { MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  getSalesChannelIdsForFranchises,
  resolveAllowedStoreLocationIds,
  getOrderIdsForStoreLocations,
  type AuthenticatedTenantRequest,
} from "../../../utils/tenant-context"
import OrderStoreLocationLink from "../../../links/order-store-location"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CakeCustomization = {
  flavor: string | null
  servings: string | null
  collection_date: string | null
  collection_time: string | null
  special_message: string | null
  inscription: string | null
  /** Edible photo cake image URL (line-item metadata). */
  photo_url: string | null
  /** Any remaining variant options / custom attributes (e.g. Size). */
  options: Record<string, string>
}

type CakeOrderItem = {
  id: string
  title: string
  product_title: string | null
  variant_title: string | null
  quantity: number
  thumbnail: string | null
  cake: CakeCustomization
}

type CakeOrder = {
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
  /** Earliest collection date across items — the "bake by" date. */
  collection_date: string | null
  store_location: { id: string; name: string | null; code: string | null } | null
  items: CakeOrderItem[]
}

// ---------------------------------------------------------------------------
// Metadata parsing
// ---------------------------------------------------------------------------

/**
 * Keys the storefront writes into line-item metadata.custom_attributes.
 * Includes Phase-0 canonical keys (`date|time|message|photo_url|flavour`) and
 * legacy capitalised labels from earlier storefront builds.
 */
const KNOWN_ATTRIBUTE_KEYS: Record<string, keyof CakeCustomization> = {
  // Canonical (Phase 0)
  date: "collection_date",
  time: "collection_time",
  message: "special_message",
  flavour: "flavor",
  flavor: "flavor",
  servings: "servings",
  photo_url: "photo_url",
  // Legacy capitalised / long-form labels
  "collection date": "collection_date",
  "collection time": "collection_time",
  "special message": "special_message",
  "special instructions": "special_message",
  instructions: "special_message",
  "sponge flavor": "flavor",
  "sponge flavour": "flavor",
  "number of servings": "servings",
  photo: "photo_url",
  "photo url": "photo_url",
}

const parseCakeCustomization = (
  metadata: Record<string, unknown> | null | undefined
): CakeCustomization => {
  const cake: CakeCustomization = {
    flavor: null,
    servings: null,
    collection_date: null,
    collection_time: null,
    special_message: null,
    inscription: null,
    photo_url: null,
    options: {},
  }

  if (!metadata) return cake

  const attrs = metadata.custom_attributes
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
    for (const [key, value] of Object.entries(attrs as Record<string, unknown>)) {
      if (value == null || value === "") continue
      const normalized = KNOWN_ATTRIBUTE_KEYS[key.toLowerCase().trim()]
      if (normalized) {
        cake[normalized] = String(value) as never
      } else {
        cake.options[key] = String(value)
      }
    }
  }

  if (typeof metadata.inscription === "string" && metadata.inscription.trim()) {
    cake.inscription = metadata.inscription.trim()
  }

  // photo_url may also live at top-level metadata in some write paths
  if (
    !cake.photo_url &&
    typeof metadata.photo_url === "string" &&
    metadata.photo_url.trim()
  ) {
    cake.photo_url = metadata.photo_url.trim()
  }

  return cake
}

// ---------------------------------------------------------------------------
// Scoping
// ---------------------------------------------------------------------------

/**
 * Resolve the sales-channel allow-list for the caller's franchise(s).
 * Returns `null` for super admins (no restriction).
 */
const resolveAllowedSalesChannelIds = async (
  req: AuthenticatedTenantRequest
): Promise<string[] | null> => {
  try {
    const franchiseIds = await resolveAdminFranchiseIds(req)
    return await getSalesChannelIdsForFranchises(req, franchiseIds)
  } catch (err) {
    if (
      err instanceof MedusaError &&
      err.type === MedusaError.Types.NOT_ALLOWED
    ) {
      return null // Super Admin
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const EMPTY_PAGE = { orders: [], count: 0, limit: 0, offset: 0 }

export const GET = async (
  req: AuthenticatedTenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const orderIdParam =
    typeof req.query?.order_id === "string" ? req.query.order_id : undefined
  const dateParam =
    typeof req.query?.date === "string" ? req.query.date : undefined
  const limit = Math.min(
    Math.max(parseInt(String(req.query?.limit ?? "50"), 10) || 50, 1),
    200
  )
  const offset = Math.max(parseInt(String(req.query?.offset ?? "0"), 10) || 0, 0)

  // ── Tier 1: franchise → sales channel allow-list ──────────────────────────
  const allowedSalesChannelIds = await resolveAllowedSalesChannelIds(req)
  if (allowedSalesChannelIds !== null && !allowedSalesChannelIds.length) {
    res.status(200).json(EMPTY_PAGE)
    return
  }

  // ── Tier 2: store-location → order id allow-list ──────────────────────────
  const allowedStoreLocationIds = await resolveAllowedStoreLocationIds(req)
  let allowedOrderIds: string[] | null = null
  if (allowedStoreLocationIds !== null) {
    if (!allowedStoreLocationIds.length) {
      res.status(200).json(EMPTY_PAGE)
      return
    }
    allowedOrderIds = await getOrderIdsForStoreLocations(
      req,
      allowedStoreLocationIds
    )
    if (!allowedOrderIds.length) {
      res.status(200).json(EMPTY_PAGE)
      return
    }
  }

  // ── Build filters ──────────────────────────────────────────────────────────
  const filters: Record<string, unknown> = {}
  if (allowedSalesChannelIds !== null) {
    filters.sales_channel_id = allowedSalesChannelIds
  }
  if (orderIdParam) {
    if (allowedOrderIds && !allowedOrderIds.includes(orderIdParam)) {
      res.status(200).json(EMPTY_PAGE)
      return
    }
    filters.id = orderIdParam
  } else if (allowedOrderIds) {
    filters.id = allowedOrderIds
  }

  // A `date` filter must be applied post-query (collection date lives inside
  // item metadata JSON), so fetch a wider window in that case.
  const take = dateParam ? 200 : limit
  const skip = dateParam ? 0 : offset

  const { data: orders, metadata: pageMeta } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "created_at",
      "email",
      "currency_code",
      "total",
      "metadata",
      "items.id",
      "items.title",
      "items.product_title",
      "items.variant_title",
      "items.quantity",
      "items.thumbnail",
      "items.metadata",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.phone",
    ],
    filters,
    pagination: {
      skip,
      take,
      order: { created_at: "DESC" },
    },
  })

  // ── Resolve store locations for the fetched orders ────────────────────────
  const orderIds = (orders as Array<{ id: string }>).map((o) => o.id)
  const storeLocationByOrderId = new Map<
    string,
    { id: string; name: string | null; code: string | null }
  >()

  if (orderIds.length) {
    const { data: links } = await query.graph({
      entity: OrderStoreLocationLink.entryPoint,
      fields: ["order_id", "store_location_id"],
      filters: { order_id: orderIds },
    })

    const locationIds = Array.from(
      new Set(
        (links as Array<{ store_location_id?: string }>)
          .map((l) => l.store_location_id)
          .filter((id): id is string => Boolean(id))
      )
    )

    if (locationIds.length) {
      const { data: locations } = await query.graph({
        entity: "store_location",
        fields: ["id", "name", "code"],
        filters: { id: locationIds },
      })

      const locationById = new Map(
        (locations as Array<{ id: string; name?: string; code?: string }>).map(
          (l) => [l.id, { id: l.id, name: l.name ?? null, code: l.code ?? null }]
        )
      )

      for (const link of links as Array<{
        order_id?: string
        store_location_id?: string
      }>) {
        if (link.order_id && link.store_location_id) {
          const location = locationById.get(link.store_location_id)
          if (location) storeLocationByOrderId.set(link.order_id, location)
        }
      }
    }
  }

  // ── Shape the response ─────────────────────────────────────────────────────
  let cakeOrders: CakeOrder[] = (orders as any[]).map((order) => {
    const metadata = (order.metadata ?? {}) as Record<string, unknown>
    const shippingAddress = order.shipping_address as
      | { first_name?: string; last_name?: string; phone?: string }
      | null

    const items: CakeOrderItem[] = ((order.items ?? []) as any[]).map(
      (item) => ({
        id: item.id,
        title: item.title,
        product_title: item.product_title ?? null,
        variant_title: item.variant_title ?? null,
        quantity: item.quantity,
        thumbnail: item.thumbnail ?? null,
        cake: parseCakeCustomization(item.metadata),
      })
    )

    const collectionDates = items
      .map((i) => i.cake.collection_date)
      .filter((d): d is string => Boolean(d))
      .sort()

    const customerName =
      [shippingAddress?.first_name, shippingAddress?.last_name]
        .filter(Boolean)
        .join(" ") || null

    return {
      id: order.id,
      display_id: order.display_id ?? null,
      status: order.status,
      created_at: order.created_at,
      email: order.email ?? null,
      currency_code: order.currency_code ?? null,
      total: order.total != null ? Number(order.total) : null,
      customer_name: customerName,
      phone: shippingAddress?.phone ?? null,
      fulfillment_method:
        typeof metadata.fulfillment_method === "string"
          ? metadata.fulfillment_method
          : null,
      requested_pickup_time:
        typeof metadata.requested_pickup_time === "string"
          ? metadata.requested_pickup_time
          : null,
      notes_for_baker:
        typeof metadata.notes_for_baker === "string"
          ? metadata.notes_for_baker
          : null,
      collection_date: collectionDates[0] ?? null,
      store_location: storeLocationByOrderId.get(order.id) ?? null,
      items,
    }
  })

  let count = pageMeta?.count ?? cakeOrders.length

  if (dateParam) {
    cakeOrders = cakeOrders.filter((o) =>
      o.items.some((i) => i.cake.collection_date === dateParam)
    )
    count = cakeOrders.length
    cakeOrders = cakeOrders.slice(offset, offset + limit)
  }

  res.status(200).json({ orders: cakeOrders, count, limit, offset })
}
