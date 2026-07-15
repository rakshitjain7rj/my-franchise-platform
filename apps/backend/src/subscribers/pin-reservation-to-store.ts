/**
 * pin-reservation-to-store.ts — Subscriber on `order.placed`
 *
 * Ensures that inventory reservations created by the checkout workflow are
 * pinned to the StockLocation linked to the customer's selected store, not
 * to a random or default stock location.
 *
 * Without this subscriber, Medusa's default reservation logic may assign
 * inventory from any stock location in the franchise's sales channel, which
 * could cause Store A's stock to be silently depleted by orders placed at
 * Store B.
 *
 * Flow:
 *   1. Read `store_location_id` from `order.metadata`
 *   2. Resolve `store_location → stock_location` via the link table
 *   3. List the order's existing reservations
 *   4. Update each reservation's `location_id` to the correct stock location
 *
 * Fail-safe: errors are logged but do NOT block the order. The reservation
 * still exists (just possibly at a different location), so stock is still
 * decremented — it's just not at the ideal location. An admin can manually
 * reassign via the inventory UI.
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import StoreLocationStockLocationLink from "../links/store-location-stock-location"

export default async function pinReservationToStore({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id
  if (!orderId) return

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  try {
    // ── 1. Resolve the order and its store_location_id ─────────────────────
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "metadata"],
      filters: { id: orderId },
    })

    const order = orders?.[0] as
      | { id: string; metadata?: Record<string, unknown> | null }
      | undefined
    if (!order) return

    const storeLocationId =
      typeof order.metadata?.store_location_id === "string"
        ? (order.metadata.store_location_id as string)
        : undefined

    if (!storeLocationId) {
      logger.info(
        `[pin-reservation-to-store] Order ${orderId} has no store_location_id — ` +
          `skipping reservation pinning.`
      )
      return
    }

    // ── 2. Resolve store_location → stock_location ────────────────────────
    const { data: stockLinks } = await query.graph({
      entity: StoreLocationStockLocationLink.entryPoint,
      fields: ["stock_location_id"],
      filters: { store_location_id: storeLocationId },
    })

    const targetStockLocationId = (stockLinks?.[0]?.stock_location_id as string) ?? null

    if (!targetStockLocationId) {
      logger.warn(
        `[pin-reservation-to-store] Store location ${storeLocationId} has no ` +
          `linked stock location — cannot pin reservations for order ${orderId}.`
      )
      return
    }

    // ── 3. List reservations for this order ────────────────────────────────
    const inventoryService = container.resolve(Modules.INVENTORY) as {
      listReservationItems: (
        filters?: Record<string, unknown>,
        config?: Record<string, unknown>
      ) => Promise<
        Array<{
          id: string
          location_id: string
          inventory_item_id: string
          quantity: number
          line_item_id?: string
        }>
      >
      updateReservationItems: (
        updates: Array<{
          id: string
          location_id?: string
        }>
      ) => Promise<unknown>
    }

    // Medusa stores the order ID in the reservation's line_item metadata,
    // but the most reliable way is to look up by line_item_id. Let's get
    // the order's line items first.
    const { data: orderItems } = await query.graph({
      entity: "order",
      fields: ["items.id"],
      filters: { id: orderId },
    })

    const lineItemIds = (
      (orderItems?.[0] as { items?: Array<{ id: string }> })?.items ?? []
    ).map((item) => item.id)

    if (!lineItemIds.length) {
      logger.info(
        `[pin-reservation-to-store] Order ${orderId} has no line items — ` +
          `skipping reservation pinning.`
      )
      return
    }

    const reservations = await inventoryService.listReservationItems(
      { line_item_id: lineItemIds },
      { select: ["id", "location_id", "inventory_item_id", "quantity", "line_item_id"] }
    )

    if (!reservations.length) {
      logger.info(
        `[pin-reservation-to-store] No reservations found for order ${orderId} — ` +
          `items may not have inventory tracking enabled.`
      )
      return
    }

    // ── 4. Update reservations that are at the wrong location ─────────────
    const toUpdate = reservations.filter(
      (r) => r.location_id !== targetStockLocationId
    )

    if (!toUpdate.length) {
      logger.info(
        `[pin-reservation-to-store] ✓ All ${reservations.length} reservation(s) for ` +
          `order ${orderId} are already at stock location ${targetStockLocationId}.`
      )
      return
    }

    await inventoryService.updateReservationItems(
      toUpdate.map((r) => ({
        id: r.id,
        location_id: targetStockLocationId,
      }))
    )

    logger.info(
      `[pin-reservation-to-store] ✓ Pinned ${toUpdate.length}/${reservations.length} ` +
        `reservation(s) for order ${orderId} to stock location ${targetStockLocationId} ` +
        `(store: ${storeLocationId}).`
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      `[pin-reservation-to-store] ✗ Failed to pin reservations for order ${orderId}: ` +
        `${message}. Reservations still exist but may be at the wrong stock location.`
    )
    // Do NOT re-throw — the order should proceed even if reservation pinning fails.
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
