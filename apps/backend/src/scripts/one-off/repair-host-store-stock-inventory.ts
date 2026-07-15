/**
 * repair-host-store-stock-inventory.ts
 *
 * Makes the **host** Postgres look like the Docker environment for Tier-2
 * store isolation:
 *
 *   1. Every StoreLocation gets its own StockLocation (same name), linked 1:1
 *   2. Fulfillment providers `manual_manual` + `cake_cake` on each stock location
 *   3. Each stock location attached to the franchise sales channel(s)
 *   4. Every managed-inventory item gets an inventory level at **every** store
 *      stock location (default qty 50 — same as Docker / seed-premium-cakes)
 *
 * Does NOT:
 *   - Clone Docker product catalogue or Birmingham store names
 *   - Delete European Warehouse (kept if already linked; unused seed loc stays)
 *   - Touch orders / payments
 *
 * Idempotent — safe to re-run.
 *
 * Usage (from apps/backend, against host .env DATABASE_URL):
 *   npx medusa exec ./src/scripts/one-off/repair-host-store-stock-inventory.ts
 *
 * Env:
 *   BACKFILL_STOCK_QTY   default 50
 *   RENAME_STOCK_TO_MATCH_STORE=1  rename existing linked stock locs to store name
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import FranchiseSalesChannelLink from "../../links/franchise-sales-channel"
import StoreLocationStockLocationLink from "../../links/store-location-stock-location"

const BACKFILL_STOCK_QTY = process.env.BACKFILL_STOCK_QTY
  ? parseInt(process.env.BACKFILL_STOCK_QTY, 10)
  : 50

const RENAME = process.env.RENAME_STOCK_TO_MATCH_STORE === "1"
const PROVIDERS = ["manual_manual", "cake_cake"] as const

type StoreRow = {
  id: string
  name: string
  code?: string | null
  address?: string | null
  franchise_id?: string | null
}

type StockRow = { id: string; name: string }

export default async function repairHostStoreStockInventory({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve(
    ContainerRegistrationKeys.REMOTE_LINK
  ) as {
    create: (data: unknown) => Promise<unknown>
    dismiss: (data: unknown) => Promise<unknown>
  }
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION) as {
    listStockLocations: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<StockRow[]>
    updateStockLocations: (
      id: string,
      data: Record<string, unknown>
    ) => Promise<unknown>
  }
  const inventoryService = container.resolve(Modules.INVENTORY) as {
    listInventoryItems: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ id: string }>>
    listInventoryLevels: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        id: string
        inventory_item_id: string
        location_id: string
        stocked_quantity: number
      }>
    >
    createInventoryLevels: (
      data: Array<{
        inventory_item_id: string
        location_id: string
        stocked_quantity: number
      }>
    ) => Promise<unknown>
  }
  const franchiseService = container.resolve("franchise") as {
    listStoreLocations: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<StoreRow[]>
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Repair host store ↔ stock ↔ inventory (Docker-like)")
  logger.info(`  Stock qty for new levels: ${BACKFILL_STOCK_QTY}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // ── 1. Load stores + existing stock locations ─────────────────────────────
  const stores = await franchiseService.listStoreLocations(
    {},
    { select: ["id", "name", "code", "address", "franchise_id"] }
  )
  if (!stores.length) {
    logger.warn("No store locations found — nothing to do.")
    return
  }
  logger.info(`Found ${stores.length} store location(s).`)

  const allStock = await stockLocationService.listStockLocations(
    {},
    { select: ["id", "name"] }
  )
  const stockById = new Map(allStock.map((s) => [s.id, s]))
  logger.info(`Found ${allStock.length} stock location(s).`)

  const { data: rawLinks } = await query.graph({
    entity: StoreLocationStockLocationLink.entryPoint,
    fields: ["store_location_id", "stock_location_id"],
  })
  const links = rawLinks as Array<{
    store_location_id?: string
    stock_location_id?: string
  }>

  // store_id → stock_id (only if stock row still exists)
  const storeToStock = new Map<string, string>()
  // stock_id → store_id (for occupancy checks)
  const stockToStore = new Map<string, string>()

  for (const link of links) {
    if (!link.store_location_id || !link.stock_location_id) continue
    if (!stockById.has(link.stock_location_id)) {
      // Stale link → stock location was deleted; dismiss so we can re-link.
      try {
        await remoteLink.dismiss({
          franchise: { store_location_id: link.store_location_id },
          [Modules.STOCK_LOCATION]: {
            stock_location_id: link.stock_location_id,
          },
        })
        logger.info(
          `  ↺ Dismissed stale link store=${link.store_location_id} → missing stock=${link.stock_location_id}`
        )
      } catch (err) {
        logger.warn(
          `  ⚠ Could not dismiss stale link ${link.store_location_id}: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      }
      continue
    }
    storeToStock.set(link.store_location_id, link.stock_location_id)
    stockToStore.set(link.stock_location_id, link.store_location_id)
  }

  // ── 2. Franchise → sales channel ids (for stock↔SC association) ───────────
  const franchiseSalesChannels = new Map<string, string[]>()
  const resolveSalesChannels = async (
    franchiseId: string | null | undefined
  ): Promise<string[]> => {
    if (!franchiseId) return []
    if (franchiseSalesChannels.has(franchiseId)) {
      return franchiseSalesChannels.get(franchiseId)!
    }
    const { data: scLinks } = await query.graph({
      entity: FranchiseSalesChannelLink.entryPoint,
      fields: ["sales_channel_id"],
      filters: { franchise_id: franchiseId },
    })
    const ids = Array.from(
      new Set(
        (scLinks as Array<{ sales_channel_id?: string }>)
          .map((l) => l.sales_channel_id)
          .filter((id): id is string => Boolean(id))
      )
    )
    franchiseSalesChannels.set(franchiseId, ids)
    return ids
  }

  // ── 3. Ensure each store has a dedicated stock location ───────────────────
  let createdStock = 0
  let linked = 0

  for (const store of stores) {
    let stockId = storeToStock.get(store.id)

    if (stockId) {
      const stock = stockById.get(stockId)
      logger.info(
        `  ✓ Already linked: "${store.name}" → "${stock?.name ?? stockId}"`
      )
      if (RENAME && stock && stock.name !== store.name) {
        await stockLocationService.updateStockLocations(stockId, {
          name: store.name,
        })
        stock.name = store.name
        logger.info(`    → Renamed stock location to "${store.name}"`)
      }
    } else {
      // Create shadow stock location (Docker pattern: same name as store).
      // StoreLocation.address is a freeform string; Medusa StockLocation.address
      // is a structured relation — never pass the raw string (it becomes address_id).
      const { result: created } = await createStockLocationsWorkflow(
        container
      ).run({
        input: {
          locations: [
            {
              name: store.name,
              metadata: {
                auto_provisioned: true,
                repaired_by: "repair-host-store-stock-inventory",
                store_location_id: store.id,
                store_address: store.address ?? null,
              },
            },
          ],
        },
      })
      stockId = created[0].id
      stockById.set(stockId, { id: stockId, name: store.name })
      createdStock++
      logger.info(`  ✅ Created stock location ${stockId} for "${store.name}"`)

      await remoteLink.create({
        franchise: { store_location_id: store.id },
        [Modules.STOCK_LOCATION]: { stock_location_id: stockId },
      })
      storeToStock.set(store.id, stockId)
      stockToStore.set(stockId, store.id)
      linked++
      logger.info(`  ✅ Linked store ${store.id} ↔ stock ${stockId}`)
    }

    // Fulfillment providers
    for (const providerId of PROVIDERS) {
      try {
        await remoteLink.create({
          [Modules.STOCK_LOCATION]: { stock_location_id: stockId },
          [Modules.FULFILLMENT]: { fulfillment_provider_id: providerId },
        })
      } catch {
        // already linked
      }
    }

    // Sales channel association
    const scIds = await resolveSalesChannels(store.franchise_id)
    if (scIds.length) {
      try {
        await linkSalesChannelsToStockLocationWorkflow(container).run({
          input: { id: stockId, add: scIds },
        })
      } catch {
        // may already be linked
      }
    } else {
      logger.warn(
        `    ⚠ Store "${store.name}" franchise has no sales channel — skip SC link`
      )
    }
  }

  // Stock location IDs that belong to live stores (the ones that need inventory)
  const storeStockIds = Array.from(new Set(storeToStock.values()))
  logger.info(
    `\nStore stock locations to stock inventory at: ${storeStockIds.length}`
  )

  // ── 4. Inventory levels at every store stock location ─────────────────────
  // Use the inventory module as source of truth. Variant graph can surface
  // product_variant_inventory_item *link* ids (pvitem_…) instead of iitem_ ids.
  const inventoryItems = await inventoryService.listInventoryItems(
    {},
    { select: ["id"], take: 100_000 }
  )
  const inventoryItemIds = inventoryItems.map((i) => i.id)

  logger.info(
    `Inventory items to ensure levels for: ${inventoryItemIds.length}`
  )

  // Existing levels for these locations
  const existingLevels = await inventoryService.listInventoryLevels(
    { location_id: storeStockIds },
    { select: ["id", "inventory_item_id", "location_id"], take: 500_000 }
  )
  const haveLevel = new Set(
    existingLevels.map((l) => `${l.inventory_item_id}::${l.location_id}`)
  )

  const levelsToCreate: Array<{
    inventory_item_id: string
    location_id: string
    stocked_quantity: number
  }> = []

  for (const itemId of inventoryItemIds) {
    for (const locId of storeStockIds) {
      const key = `${itemId}::${locId}`
      if (haveLevel.has(key)) continue
      levelsToCreate.push({
        inventory_item_id: itemId,
        location_id: locId,
        stocked_quantity: BACKFILL_STOCK_QTY,
      })
    }
  }

  logger.info(`Missing inventory levels to create: ${levelsToCreate.length}`)

  let levelsCreated = 0
  const BATCH = 200
  for (let i = 0; i < levelsToCreate.length; i += BATCH) {
    const batch = levelsToCreate.slice(i, i + BATCH)
    await inventoryService.createInventoryLevels(batch)
    levelsCreated += batch.length
    if (levelsToCreate.length > BATCH) {
      logger.info(
        `  → Inventory levels ${Math.min(i + BATCH, levelsToCreate.length)}/${levelsToCreate.length}`
      )
    }
  }

  // ── 5. Summary report ─────────────────────────────────────────────────────
  logger.info("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  DONE")
  logger.info(`  Stock locations created : ${createdStock}`)
  logger.info(`  New store↔stock links   : ${linked}`)
  logger.info(`  Inventory levels created: ${levelsCreated}`)
  logger.info("  Final mapping:")
  for (const store of stores) {
    const sid = storeToStock.get(store.id)
    const sname = sid ? stockById.get(sid)?.name ?? sid : "—"
    logger.info(`    ${store.code ?? "?"} | ${store.name} → ${sname}`)
  }
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(
    "Tip: restart the local Medusa backend if it was already running so caches refresh."
  )
}
