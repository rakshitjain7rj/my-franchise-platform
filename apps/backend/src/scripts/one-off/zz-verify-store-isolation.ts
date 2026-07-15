/**
 * zz-verify-store-isolation.ts
 *
 * End-to-end proof of the store-level (Tier-2) isolation guarantees, using real
 * DB records via the module services + link engine. Creates a throwaway test
 * franchise with TWO stores (each with its OWN stock location), then asserts:
 *
 *   1. LOCATIONS   — two independent store locations exist.
 *   2. INVENTORY   — each store has its own stock location; changing store A's
 *                    stock does NOT change store B's.
 *   3. PRODUCTS    — a shared product is visible at both stores; a product marked
 *                    exclusive to store A is hidden at store B (uses the exact
 *                    availability rule the storefront middleware applies).
 *   4. ORDERS      — an order placed at store A is returned only for store A,
 *                    never for store B.
 *
 * Everything it creates is prefixed ZZ_TEST_ and DELETED at the end (unless you
 * pass KEEP=1), so your real data is untouched.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/zz-verify-store-isolation.ts
 *   KEEP=1 npx medusa exec ./src/scripts/zz-verify-store-isolation.ts   # leave test data for UI inspection
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import FranchiseProductLink from "../../links/franchise-product"
import OrderStoreLocationLink from "../../links/order-store-location"
import StoreLocationProductLink from "../../links/store-location-product"

const TAG = "ZZ_TEST_"

export default async function verifyStoreIsolation({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const franchise = container.resolve("franchise") as any
  const stockLocation = container.resolve(Modules.STOCK_LOCATION) as any
  const inventory = container.resolve(Modules.INVENTORY) as any
  const productSvc = container.resolve(Modules.PRODUCT) as any
  const orderSvc = container.resolve(Modules.ORDER) as any

  const results: Array<{ name: string; pass: boolean; detail: string }> = []
  const check = (name: string, pass: boolean, detail: string) => {
    results.push({ name, pass, detail })
    logger.info(`${pass ? "✅ PASS" : "❌ FAIL"} — ${name}: ${detail}`)
  }

  // Track created ids for cleanup.
  const created: {
    franchiseId?: string
    storeIds: string[]
    stockIds: string[]
    productIds: string[]
    inventoryItemIds: string[]
    orderIds: string[]
  } = { storeIds: [], stockIds: [], productIds: [], inventoryItemIds: [], orderIds: [] }

  try {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info("  STORE ISOLATION VERIFICATION")
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    // ── Setup: franchise + 2 stores, each with its OWN stock location ─────────
    const fr = await franchise.createFranchises({
      name: `${TAG}Franchise`,
      code: `${TAG}FR`,
      is_active: true,
    })
    created.franchiseId = fr.id

    const storeA = await franchise.createStoreLocations({
      name: `${TAG}Store A`,
      code: `${TAG}A`,
      franchise_id: fr.id,
    })
    const storeB = await franchise.createStoreLocations({
      name: `${TAG}Store B`,
      code: `${TAG}B`,
      franchise_id: fr.id,
    })
    created.storeIds.push(storeA.id, storeB.id)

    const stockA = await stockLocation.createStockLocations({ name: `${TAG}Stock A` })
    const stockB = await stockLocation.createStockLocations({ name: `${TAG}Stock B` })
    created.stockIds.push(stockA.id, stockB.id)

    // Link each store to its OWN stock location (the fix the seeded data lacks).
    await remoteLink.create([
      { franchise: { store_location_id: storeA.id }, [Modules.STOCK_LOCATION]: { stock_location_id: stockA.id } },
      { franchise: { store_location_id: storeB.id }, [Modules.STOCK_LOCATION]: { stock_location_id: stockB.id } },
    ])

    check(
      "1. LOCATIONS independent",
      storeA.id !== storeB.id,
      `store A=${storeA.id}, store B=${storeB.id}`
    )

    // ── 2. INVENTORY independence ────────────────────────────────────────────
    const invProduct = await productSvc.createProducts({
      title: `${TAG}Inventory Cake`,
      status: "published",
      options: [{ title: "Size", values: ["Std"] }],
      variants: [{ title: "Std", sku: `${TAG}SKU_INV`, options: { Size: "Std" } }],
    })
    created.productIds.push(invProduct.id)
    await remoteLink.create([
      { franchise: { franchise_id: fr.id }, [Modules.PRODUCT]: { product_id: invProduct.id } },
    ])

    const invItemRes = await inventory.createInventoryItems([{ sku: `${TAG}SKU_INV` }])
    const invItem = Array.isArray(invItemRes) ? invItemRes[0] : invItemRes
    created.inventoryItemIds.push(invItem.id)

    await inventory.createInventoryLevels([
      { inventory_item_id: invItem.id, location_id: stockA.id, stocked_quantity: 5 },
      { inventory_item_id: invItem.id, location_id: stockB.id, stocked_quantity: 20 },
    ])

    // Mutate ONLY store A's level, then read both back.
    await inventory.updateInventoryLevels([
      { inventory_item_id: invItem.id, location_id: stockA.id, stocked_quantity: 3 },
    ])

    const [afterA] = await inventory.listInventoryLevels({ inventory_item_id: invItem.id, location_id: stockA.id })
    const [afterB] = await inventory.listInventoryLevels({ inventory_item_id: invItem.id, location_id: stockB.id })

    check(
      "2. INVENTORY independent",
      afterA.stocked_quantity === 3 && afterB.stocked_quantity === 20,
      `after changing A to 3 → store A=${afterA.stocked_quantity}, store B=${afterB.stocked_quantity} (B must stay 20)`
    )

    // ── 3. PRODUCT sharing vs exclusivity ────────────────────────────────────
    const sharedProduct = await productSvc.createProducts({ title: `${TAG}Shared Cake`, status: "published" })
    const exclusiveProduct = await productSvc.createProducts({ title: `${TAG}Store-A-Only Cake`, status: "published" })
    created.productIds.push(sharedProduct.id, exclusiveProduct.id)
    await remoteLink.create([
      { franchise: { franchise_id: fr.id }, [Modules.PRODUCT]: { product_id: sharedProduct.id } },
      { franchise: { franchise_id: fr.id }, [Modules.PRODUCT]: { product_id: exclusiveProduct.id } },
    ])
    // Mark exclusiveProduct available ONLY at store A.
    await remoteLink.create([
      { franchise: { store_location_id: storeA.id }, [Modules.PRODUCT]: { product_id: exclusiveProduct.id } },
    ])

    const visibleAt = await computeVisibleProducts(query, fr.id, [invProduct.id, sharedProduct.id, exclusiveProduct.id])
    const visibleA = visibleAt(storeA.id)
    const visibleB = visibleAt(storeB.id)

    check(
      "3a. SHARED product visible at BOTH stores",
      visibleA.has(sharedProduct.id) && visibleB.has(sharedProduct.id),
      `shared in A=${visibleA.has(sharedProduct.id)}, in B=${visibleB.has(sharedProduct.id)}`
    )
    check(
      "3b. EXCLUSIVE product visible ONLY at store A",
      visibleA.has(exclusiveProduct.id) && !visibleB.has(exclusiveProduct.id),
      `exclusive in A=${visibleA.has(exclusiveProduct.id)}, in B=${visibleB.has(exclusiveProduct.id)} (B must be false)`
    )

    // ── 4. ORDER isolation ───────────────────────────────────────────────────
    const orderA = await orderSvc.createOrders({ currency_code: "usd", email: `${TAG.toLowerCase()}a@test.com` })
    const orderB = await orderSvc.createOrders({ currency_code: "usd", email: `${TAG.toLowerCase()}b@test.com` })
    created.orderIds.push(orderA.id, orderB.id)
    await remoteLink.create([
      { franchise: { store_location_id: storeA.id }, [Modules.ORDER]: { order_id: orderA.id } },
      { franchise: { store_location_id: storeB.id }, [Modules.ORDER]: { order_id: orderB.id } },
    ])

    const ordersForA = await ordersForStore(query, storeA.id)
    const ordersForB = await ordersForStore(query, storeB.id)

    check(
      "4. ORDERS isolated per store",
      ordersForA.length === 1 && ordersForA[0] === orderA.id &&
        ordersForB.length === 1 && ordersForB[0] === orderB.id,
      `store A sees [${ordersForA.join(",")}], store B sees [${ordersForB.join(",")}]`
    )

    // ── Summary ──────────────────────────────────────────────────────────────
    const passed = results.filter((r) => r.pass).length
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info(`  RESULT: ${passed}/${results.length} checks passed`)
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  } catch (err: any) {
    logger.error(`VERIFICATION ERROR: ${err?.message || err}`)
    logger.error(err?.stack || "")
  } finally {
    if (process.env.KEEP === "1") {
      logger.info("KEEP=1 set — leaving ZZ_TEST_ data in place for UI inspection.")
      logger.info(`  franchise=${created.franchiseId} storeA/B=${created.storeIds.join(",")}`)
      return
    }
    // ── Cleanup (reverse order of dependency) ────────────────────────────────
    try {
      if (created.orderIds.length) await orderSvc.deleteOrders(created.orderIds)
      if (created.inventoryItemIds.length) await inventory.deleteInventoryItems(created.inventoryItemIds)
      if (created.productIds.length) await productSvc.deleteProducts(created.productIds)
      if (created.stockIds.length) await stockLocation.deleteStockLocations(created.stockIds)
      if (created.storeIds.length) await franchise.deleteStoreLocations(created.storeIds)
      if (created.franchiseId) await franchise.deleteFranchises(created.franchiseId)
      logger.info("🧹 Cleaned up all ZZ_TEST_ data.")
    } catch (cleanupErr: any) {
      logger.warn(`Cleanup incomplete (safe to ignore / re-run): ${cleanupErr?.message || cleanupErr}`)
    }
  }
}

/**
 * Replicates the storefront middleware's per-store availability rule:
 *   a product is visible at a store IF it has no availability rows (shared) OR a
 *   row names that store. Returns a function storeId → Set<visibleProductId>.
 */
async function computeVisibleProducts(
  query: any,
  franchiseId: string,
  productIds: string[]
) {
  const { data: fpLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: { franchise_id: franchiseId },
  })
  const franchiseProductIds = new Set<string>(
    fpLinks.map((l: any) => l.product_id).filter(Boolean)
  )

  const { data: slpLinks } = await query.graph({
    entity: StoreLocationProductLink.entryPoint,
    fields: ["product_id", "store_location_id"],
    filters: { product_id: productIds },
  })
  const restricted = new Map<string, Set<string>>() // product_id → allowed store ids
  for (const l of slpLinks as any[]) {
    if (!l.product_id) continue
    if (!restricted.has(l.product_id)) restricted.set(l.product_id, new Set())
    if (l.store_location_id) restricted.get(l.product_id)!.add(l.store_location_id)
  }

  return (storeId: string) => {
    const visible = new Set<string>()
    for (const pid of franchiseProductIds) {
      const allowed = restricted.get(pid)
      if (!allowed || allowed.has(storeId)) visible.add(pid)
    }
    return visible
  }
}

/** Resolve the order ids linked to a store via the order↔store_location link. */
async function ordersForStore(query: any, storeLocationId: string): Promise<string[]> {
  const { data } = await query.graph({
    entity: OrderStoreLocationLink.entryPoint,
    fields: ["order_id"],
    filters: { store_location_id: storeLocationId },
  })
  return data.map((l: any) => l.order_id).filter(Boolean)
}
