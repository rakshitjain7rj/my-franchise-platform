/**
 * link-order-to-store-location.ts — Subscriber on `order.placed`
 *
 * Binds a freshly placed order to the physical StoreLocation the customer chose
 * at cart time, creating a queryable `store_location ←→ order` link
 * (see src/links/order-store-location.ts). Store-scoped branch managers are
 * restricted to their branch's orders via this link
 * (see src/api/middlewares/scope-store-orders.ts).
 *
 * Why a subscriber (not a workflow hook)?
 * ───────────────────────────────────────
 * `completeCartWorkflow` creates an internal `orderCreated` hook but does NOT
 * expose it for consumption (only its `validate` hook is registered on the
 * workflow response). The reliable, supported integration point is therefore
 * the `order.placed` event. Unlike product creation, there is no immediate
 * admin re-fetch race here: store scoping is read by managers on their own
 * schedule, so eventual consistency within the event loop is acceptable.
 *
 * The selected branch is read from `order.metadata.store_location_id`, which
 * Medusa copies from the completing cart's metadata (the storefront sets it in
 * createCart — see apps/web/src/lib/cart/cart-actions.ts).
 *
 * Fail-closed policy:
 *   - No store_location_id on the order → skip (franchise without branches).
 *   - store_location_id present but its franchise ≠ the order's franchise →
 *     cross-tenant anomaly: skip and log an error (never fabricate the link).
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import OrderStoreLocationLink from "../links/order-store-location"
import FranchiseSalesChannelLink from "../links/franchise-sales-channel"

export default async function linkOrderToStoreLocation({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id
  if (!orderId) return

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // ── Resolve the order's selected store + franchise ────────────────────────
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "metadata", "sales_channel_id"],
    filters: { id: orderId },
  })

  const order = orders?.[0] as
    | { id: string; metadata?: Record<string, unknown> | null; sales_channel_id?: string }
    | undefined
  if (!order) return

  const storeLocationId =
    typeof order.metadata?.store_location_id === "string"
      ? (order.metadata.store_location_id as string)
      : undefined

  if (!storeLocationId) {
    logger.info(
      `[link-order-to-store-location] Order ${orderId} has no store_location_id — ` +
        `skipping store link (franchise without physical branches).`
    )
    return
  }

  // ── Idempotency: don't duplicate an existing link ─────────────────────────
  const { data: existing } = await query.graph({
    entity: OrderStoreLocationLink.entryPoint,
    fields: ["order_id"],
    filters: { order_id: orderId, store_location_id: storeLocationId },
  })
  if (existing?.length) return

  // ── Fail-closed franchise consistency check ───────────────────────────────
  const { data: storeLocations } = await query.graph({
    entity: "store_location",
    fields: ["id", "franchise_id"],
    filters: { id: storeLocationId },
  })
  const storeLocation = storeLocations?.[0] as
    | { id: string; franchise_id?: string }
    | undefined

  if (!storeLocation) {
    logger.error(
      `[link-order-to-store-location] ✗ Order ${orderId} references unknown ` +
        `store_location ${storeLocationId} — skipping link.`
    )
    return
  }

  const orderFranchiseId = await resolveOrderFranchiseId(
    query,
    order.sales_channel_id
  )
  if (
    orderFranchiseId &&
    storeLocation.franchise_id &&
    orderFranchiseId !== storeLocation.franchise_id
  ) {
    logger.error(
      `[link-order-to-store-location] ✗ Cross-tenant anomaly: order ${orderId} ` +
        `(franchise ${orderFranchiseId}) selected store_location ` +
        `${storeLocationId} (franchise ${storeLocation.franchise_id}). Skipping link.`
    )
    return
  }

  // ── Create the store_location ←→ order link ───────────────────────────────
  const remoteLink = container.resolve("remoteLink")
  try {
    await remoteLink.create({
      franchise: { store_location_id: storeLocationId },
      [Modules.ORDER]: { order_id: orderId },
    })
    logger.info(
      `[link-order-to-store-location] ✓ Linked order ${orderId} → store_location ${storeLocationId}`
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      `[link-order-to-store-location] ✗ Failed to link order ${orderId} → ` +
        `store_location ${storeLocationId}: ${message}`
    )
  }
}

/**
 * Resolve the franchise that owns an order via:
 *   sales_channel_id → franchise-sales-channel link → franchise_id
 * Returns undefined when unresolvable, in which case the caller skips the strict
 * mismatch check rather than blocking the link.
 */
async function resolveOrderFranchiseId(
  query: { graph: (opts: any) => Promise<{ data: any[] }> },
  salesChannelId: string | undefined
): Promise<string | undefined> {
  if (!salesChannelId) return undefined

  const { data: links } = await query.graph({
    entity: FranchiseSalesChannelLink.entryPoint,
    fields: ["franchise_id"],
    filters: { sales_channel_id: salesChannelId },
  })

  return (links?.[0]?.franchise_id as string | undefined) ?? undefined
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
