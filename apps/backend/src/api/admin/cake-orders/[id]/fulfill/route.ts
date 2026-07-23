/**
 * POST /admin/cake-orders/:id/fulfill
 *
 * One-click fulfillment for the Cake Orders production board.
 *
 * The baker already knows which store baked the cake — the customer chose it
 * at cart time and we linked the order to that StoreLocation on place. This
 * endpoint skips Medusa's native "pick stock location + shipping option"
 * dialog and creates a full-item fulfillment using those pre-selected values:
 *
 *   1. Stock location  ← store_location ↔ stock_location link for the order's
 *                        fulfilling branch (or order.metadata.store_location_id)
 *   2. Shipping option ← order.shipping_methods[0] (what the customer chose)
 *   3. Items           ← every remaining unfulfilled quantity on the order
 *
 * Tenant scoping mirrors GET /admin/cake-orders (franchise sales-channel +
 * optional store-location allow-list). Super admins may fulfill any order.
 */

import type { MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { createOrderFulfillmentWorkflow } from "@medusajs/core-flows"
import {
  resolveAdminFranchiseIds,
  getSalesChannelIdsForFranchises,
  resolveAllowedStoreLocationIds,
  getOrderIdsForStoreLocations,
  type AuthenticatedTenantRequest,
} from "../../../../../utils/tenant-context"
import OrderStoreLocationLink from "../../../../../links/order-store-location"
import StoreLocationStockLocationLink from "../../../../../links/store-location-stock-location"
import {
  buildUnfulfilledItemsPayload,
  type FulfillableOrderItem,
} from "../../../../../utils/cake-order-fulfill"

type OrderRow = {
  id: string
  status?: string | null
  sales_channel_id?: string | null
  metadata?: Record<string, unknown> | null
  items?: FulfillableOrderItem[] | null
  shipping_methods?: Array<{
    id?: string
    shipping_option_id?: string | null
  }> | null
}

/**
 * Franchise-tier access: order must live on a sales channel owned by one of
 * the caller's franchises. Super admins (NOT_ALLOWED from resolve) pass.
 */
const assertFranchiseAccess = async (
  req: AuthenticatedTenantRequest,
  order: OrderRow
): Promise<void> => {
  let franchiseIds: string[]
  try {
    franchiseIds = await resolveAdminFranchiseIds(req)
  } catch (err) {
    if (
      err instanceof MedusaError &&
      err.type === MedusaError.Types.NOT_ALLOWED
    ) {
      return // super admin
    }
    throw err
  }

  if (!franchiseIds.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No franchise context"
    )
  }

  const salesChannelIds = await getSalesChannelIdsForFranchises(
    req,
    franchiseIds
  )
  if (!salesChannelIds.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No sales channels for your franchise"
    )
  }

  if (
    !order.sales_channel_id ||
    !salesChannelIds.includes(order.sales_channel_id)
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Order ${order.id} was not found`
    )
  }
}

/**
 * Store-tier access: store-scoped users may only fulfill orders linked to
 * their assigned StoreLocation(s). Franchise-wide admins pass (null list).
 */
const assertStoreAccess = async (
  req: AuthenticatedTenantRequest,
  orderId: string
): Promise<void> => {
  const allowedStoreLocationIds = await resolveAllowedStoreLocationIds(req)
  if (allowedStoreLocationIds === null) return
  if (!allowedStoreLocationIds.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No store locations assigned to your account"
    )
  }

  const allowedOrderIds = await getOrderIdsForStoreLocations(
    req,
    allowedStoreLocationIds
  )
  if (!allowedOrderIds.includes(orderId)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Order ${orderId} was not found`
    )
  }
}

/**
 * Resolve the physical branch for this order (link first, metadata fallback)
 * then map it to its Medusa StockLocation.
 */
const resolveStockLocationId = async (
  req: AuthenticatedTenantRequest,
  order: OrderRow
): Promise<{ storeLocationId: string; stockLocationId: string }> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  let storeLocationId: string | null = null

  const { data: links } = await query.graph({
    entity: OrderStoreLocationLink.entryPoint,
    fields: ["store_location_id"],
    filters: { order_id: order.id },
  })
  storeLocationId =
    (links as Array<{ store_location_id?: string }>)[0]?.store_location_id ??
    null

  if (!storeLocationId) {
    const metaId = order.metadata?.store_location_id
    if (typeof metaId === "string" && metaId.trim()) {
      storeLocationId = metaId.trim()
    }
  }

  if (!storeLocationId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "This order has no fulfilling store. Open the order detail to fulfill manually, or ensure the customer selected a store at checkout."
    )
  }

  const { data: stockLinks } = await query.graph({
    entity: StoreLocationStockLocationLink.entryPoint,
    fields: ["stock_location_id"],
    filters: { store_location_id: storeLocationId },
  })
  const stockLocationId =
    (stockLinks as Array<{ stock_location_id?: string }>)[0]
      ?.stock_location_id ?? null

  if (!stockLocationId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Store location ${storeLocationId} is not linked to a stock location. Provision the branch before fulfilling.`
    )
  }

  return { storeLocationId, stockLocationId }
}

export const POST = async (
  req: AuthenticatedTenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const orderId = req.params.id
  if (!orderId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Order id is required"
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "sales_channel_id",
      "metadata",
      "items.id",
      "items.title",
      "items.quantity",
      "items.detail.quantity",
      "items.detail.fulfilled_quantity",
      "shipping_methods.id",
      "shipping_methods.shipping_option_id",
    ],
    filters: { id: orderId },
  })

  const order = (orders as OrderRow[] | undefined)?.[0]
  if (!order) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Order ${orderId} was not found`
    )
  }

  await assertFranchiseAccess(req, order)
  await assertStoreAccess(req, orderId)

  if ((order.status ?? "").toLowerCase() === "canceled") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Cannot fulfill a canceled order"
    )
  }

  const itemsToFulfill = buildUnfulfilledItemsPayload(order.items)

  if (!itemsToFulfill.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "All items on this order are already fulfilled"
    )
  }

  const shippingOptionId =
    order.shipping_methods?.find((m) => m.shipping_option_id)
      ?.shipping_option_id ?? null

  if (!shippingOptionId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "This order has no shipping method. Open the order detail to fulfill manually after adding a shipping method."
    )
  }

  const { storeLocationId, stockLocationId } = await resolveStockLocationId(
    req,
    order
  )

  const createdBy = req.auth_context?.actor_id

  const { result: fulfillment } = await createOrderFulfillmentWorkflow(
    req.scope
  ).run({
    input: {
      order_id: orderId,
      items: itemsToFulfill,
      location_id: stockLocationId,
      shipping_option_id: shippingOptionId,
      created_by: createdBy,
      no_notification: false,
      metadata: {
        fulfilled_via: "cake-orders-one-click",
        store_location_id: storeLocationId,
      },
    },
  })

  res.status(200).json({
    fulfillment_id: fulfillment?.id ?? null,
    order_id: orderId,
    store_location_id: storeLocationId,
    stock_location_id: stockLocationId,
    shipping_option_id: shippingOptionId,
    items: itemsToFulfill,
  })
}
