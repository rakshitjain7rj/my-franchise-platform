/**
 * backfill-order-store-location-links.ts
 *
 * One-time reconcile for orders placed BEFORE the `store_location ←→ order` link
 * existed. Historically the selected branch was persisted only inside
 * `order.metadata.store_location_id` (an unindexed JSON key). This script reads
 * that key for every order and creates the missing link row so store-scoped
 * admin queries (see src/api/middlewares/scope-store-orders.ts) return correct
 * results for legacy orders.
 *
 * The order.metadata.store_location_id key is left intact — it is still the
 * customer-facing record of their chosen branch and is read elsewhere. This
 * script only adds link rows; it never mutates order data.
 *
 * A store_location whose franchise does not match the order's franchise is a
 * cross-tenant anomaly and is skipped with a warning rather than linked.
 *
 * Idempotent and safe to run repeatedly.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/backfill-order-store-location-links.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import OrderStoreLocationLink from "../../links/order-store-location"
import FranchiseSalesChannelLink from "../../links/franchise-sales-channel"

const BATCH_SIZE = 200

export default async function backfillOrderStoreLocationLinks({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const orderService = container.resolve(Modules.ORDER)

  logger.info(
    "Backfilling order↔store_location links from order.metadata.store_location_id…"
  )

  // 1. Existing (store_location_id, order_id) pairs → idempotency guard.
  const { data: existingLinks } = await query.graph({
    entity: OrderStoreLocationLink.entryPoint,
    fields: ["store_location_id", "order_id"],
  })
  const existingPairs = new Set<string>(
    existingLinks
      .filter((l: any) => l.store_location_id && l.order_id)
      .map((l: any) => `${l.store_location_id}::${l.order_id}`)
  )

  // 2. store_location_id → franchise_id map (to validate tenant consistency).
  const { data: storeLocations } = await query.graph({
    entity: "store_location",
    fields: ["id", "franchise_id"],
  })
  const storeToFranchise = new Map<string, string | undefined>(
    storeLocations.map((s: any) => [s.id, s.franchise_id])
  )

  // 3. sales_channel_id → franchise_id map (to resolve an order's franchise).
  const { data: fscLinks } = await query.graph({
    entity: FranchiseSalesChannelLink.entryPoint,
    fields: ["franchise_id", "sales_channel_id"],
  })
  const channelToFranchise = new Map<string, string | undefined>(
    fscLinks
      .filter((l: any) => l.sales_channel_id)
      .map((l: any) => [l.sales_channel_id, l.franchise_id])
  )

  let linksCreated = 0
  let skippedNoStore = 0
  let skippedUnknownStore = 0
  let skippedMismatch = 0
  let failed = 0
  let totalScanned = 0

  for (let offset = 0; ; offset += BATCH_SIZE) {
    const orders = await orderService.listOrders(
      {},
      { take: BATCH_SIZE, skip: offset, select: ["id", "metadata", "sales_channel_id"] }
    )
    if (!orders.length) break
    totalScanned += orders.length

    for (const order of orders) {
      const metadata = (order.metadata ?? {}) as Record<string, unknown>
      const storeLocationId =
        typeof metadata.store_location_id === "string"
          ? metadata.store_location_id
          : undefined

      if (!storeLocationId) {
        skippedNoStore++
        continue
      }

      const pairKey = `${storeLocationId}::${order.id}`
      if (existingPairs.has(pairKey)) continue

      if (!storeToFranchise.has(storeLocationId)) {
        logger.warn(
          `⚠ Order ${order.id} references unknown store_location ${storeLocationId}; skipping.`
        )
        skippedUnknownStore++
        continue
      }

      // Tenant consistency: store's franchise must match order's franchise when
      // both are resolvable.
      const storeFranchise = storeToFranchise.get(storeLocationId)
      const orderFranchise = order.sales_channel_id
        ? channelToFranchise.get(order.sales_channel_id)
        : undefined

      if (storeFranchise && orderFranchise && storeFranchise !== orderFranchise) {
        logger.warn(
          `⚠ Order ${order.id} (franchise ${orderFranchise}) references ` +
            `store_location ${storeLocationId} (franchise ${storeFranchise}); ` +
            `cross-tenant anomaly — skipping.`
        )
        skippedMismatch++
        continue
      }

      try {
        await remoteLink.create({
          franchise: { store_location_id: storeLocationId },
          [Modules.ORDER]: { order_id: order.id },
        })
        existingPairs.add(pairKey)
        linksCreated++
      } catch (err: any) {
        logger.error(
          `✗ Failed to link order ${order.id} → store_location ${storeLocationId}: ${
            err.message || err
          }`
        )
        failed++
      }
    }

    if (orders.length < BATCH_SIZE) break
  }

  logger.info(`\n──────────────────────────────────────────────────`)
  logger.info(`Backfill complete. Scanned ${totalScanned} orders.`)
  logger.info(`  Links created:               ${linksCreated}`)
  logger.info(`  Skipped (no store on order): ${skippedNoStore}`)
  logger.info(`  Skipped (unknown store):     ${skippedUnknownStore}`)
  logger.info(`  Skipped (franchise mismatch):${skippedMismatch}`)
  logger.info(`  Failed:                      ${failed}`)
  logger.info(`──────────────────────────────────────────────────`)
}
