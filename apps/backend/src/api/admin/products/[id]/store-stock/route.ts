/**
 * GET  /admin/products/:id/store-stock
 * POST /admin/products/:id/store-stock
 *
 * Phase 4 — Merged "Store Availability & Stock" endpoint.
 *
 * Replaces the old /store-availability endpoint by unifying two previously
 * separate concepts into one response per branch:
 *
 *   • on_menu   — whether the store-location-product override is active
 *                 (true = restricted to this branch, false = shared globally)
 *   • quantity  — the editable stocked_quantity at the branch's stock location
 *
 * GET  → returns one row per franchise store location with both on_menu and
 *         quantity fields. This is the single source of truth the widget needs
 *         to render a complete per-branch table.
 *
 * POST → body: { branches: Array<{ store_location_id, on_menu, quantity }> }
 *         Reconciles store-location-product overrides (add/dismiss) and updates
 *         inventory levels (stocked_quantity) in one round-trip.
 *
 * Protected by /admin/products/:id/* middleware (authenticate + guardAdminProductMutation).
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import FranchiseProductLink from "../../../../../links/franchise-product"
import StoreLocationProductLink from "../../../../../links/store-location-product"
import StoreLocationStockLocationLink from "../../../../../links/store-location-stock-location"

// ── Types ────────────────────────────────────────────────────────────────────

type BranchStockRow = {
  store_location_id: string
  store_location_name: string
  store_location_code: string
  is_active: boolean
  is_accepting_orders: boolean
  /** True = this branch is in the override list (restricted to it). */
  on_menu: boolean
  /** null when no stock location is wired to this branch. */
  stock_location_id: string | null
  /** null when the stock location has no inventory level for this product. */
  quantity: number | null
  /** True if the branch is missing a stock location link (unhealthy). */
  needs_wiring: boolean
}

type StoreStockResponse = {
  product_id: string
  /**
   * True when the override list is empty — product is shared across all stores.
   * False when any store overrides exist.
   */
  shared_across_all_stores: boolean
  branches: BranchStockRow[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveProductFranchiseId(
  query: any,
  productId: string
): Promise<string | undefined> {
  const { data } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["franchise_id"],
    filters: { product_id: productId },
  })
  return data?.[0]?.franchise_id as string | undefined
}

// ── GET ───────────────────────────────────────────────────────────────────────

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // 1. Franchise that owns this product
  const franchiseId = await resolveProductFranchiseId(query, productId)
  if (!franchiseId) {
    return res.json({
      product_id: productId,
      shared_across_all_stores: true,
      branches: [],
    } as StoreStockResponse)
  }

  // 2. All store locations in this franchise
  const { data: storeLocations } = await query.graph({
    entity: "store_location",
    fields: ["id", "name", "code", "is_active", "is_accepting_orders"],
    filters: { franchise_id: franchiseId },
  })

  if (!storeLocations.length) {
    return res.json({
      product_id: productId,
      shared_across_all_stores: true,
      branches: [],
    } as StoreStockResponse)
  }

  const storeLocationIds = storeLocations.map((sl: any) => sl.id as string)

  // 3. Current on-menu override list
  const { data: overrideLinks } = await query.graph({
    entity: StoreLocationProductLink.entryPoint,
    fields: ["store_location_id"],
    filters: { product_id: productId },
  })
  const overrideStoreIds = new Set(
    (overrideLinks as Array<{ store_location_id?: string }>)
      .map((l) => l.store_location_id)
      .filter((id): id is string => Boolean(id))
  )

  // 4. Stock location IDs for these store locations
  const { data: slStockLinks } = await query.graph({
    entity: StoreLocationStockLocationLink.entryPoint,
    fields: ["store_location_id", "stock_location_id"],
    filters: { store_location_id: storeLocationIds },
  })

  type SlStockLink = { store_location_id: string; stock_location_id: string }
  const stockLocationByStore = new Map<string, string>(
    (slStockLinks as SlStockLink[]).map((l) => [
      l.store_location_id,
      l.stock_location_id,
    ])
  )

  // 5. Inventory items for this product's variants
  const { data: variantData } = await query.graph({
    entity: "product_variant",
    fields: ["id", "inventory_items.id"],
    filters: { product_id: [productId] },
  })

  const inventoryItemIds = Array.from(
    new Set(
      (variantData as Array<{ inventory_items?: Array<{ id?: string }> }>).flatMap(
        (v) => (v.inventory_items ?? []).map((i) => i.id).filter(Boolean) as string[]
      )
    )
  )

  // 6. Inventory levels at the franchise's stock locations
  const uniqueStockLocationIds = Array.from(new Set(stockLocationByStore.values()))

  // Map: stock_location_id → summed stocked_quantity for this product
  const stockByLocation = new Map<string, number>()

  if (inventoryItemIds.length && uniqueStockLocationIds.length) {
    const { data: levels } = await query.graph({
      entity: "inventory_level",
      fields: ["location_id", "inventory_item_id", "stocked_quantity"],
      filters: {
        location_id: uniqueStockLocationIds,
        inventory_item_id: inventoryItemIds,
      },
    })

    for (const level of levels as Array<{
      location_id: string
      stocked_quantity: number
    }>) {
      const curr = stockByLocation.get(level.location_id) ?? 0
      stockByLocation.set(
        level.location_id,
        curr + (Number(level.stocked_quantity) || 0)
      )
    }
  }

  // 7. Assemble response
  const branches: BranchStockRow[] = storeLocations.map((sl: any) => {
    const stockLocId = stockLocationByStore.get(sl.id) ?? null
    return {
      store_location_id: sl.id,
      store_location_name: sl.name ?? "",
      store_location_code: sl.code ?? "",
      is_active: Boolean(sl.is_active),
      is_accepting_orders: Boolean(sl.is_accepting_orders),
      on_menu: overrideStoreIds.has(sl.id),
      stock_location_id: stockLocId,
      quantity: stockLocId != null ? (stockByLocation.get(stockLocId) ?? 0) : null,
      needs_wiring: stockLocId === null,
    }
  })

  res.json({
    product_id: productId,
    shared_across_all_stores: overrideStoreIds.size === 0,
    branches,
  } as StoreStockResponse)
}

// ── POST ──────────────────────────────────────────────────────────────────────

type BranchUpdate = {
  store_location_id: string
  /** Whether this branch should be in the on-menu override list. */
  on_menu: boolean
  /** New stocked_quantity. null = leave unchanged. */
  quantity: number | null
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = req.scope.resolve("remoteLink")
  const inventoryService = req.scope.resolve(Modules.INVENTORY) as any

  const body = (req.validatedBody ?? req.body) as { branches?: unknown }
  const rawBranches = body?.branches

  if (!Array.isArray(rawBranches)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "`branches` must be an array of { store_location_id, on_menu, quantity }."
    )
  }

  const updates = rawBranches as BranchUpdate[]

  // Validate ownership
  const franchiseId = await resolveProductFranchiseId(query, productId)
  if (!franchiseId && updates.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Product has no franchise; cannot update store availability."
    )
  }

  if (updates.length && franchiseId) {
    const requestedStoreIds = updates.map((u) => u.store_location_id)
    const { data: stores } = await query.graph({
      entity: "store_location",
      fields: ["id"],
      filters: { id: requestedStoreIds, franchise_id: franchiseId },
    })
    const validIds = new Set(stores.map((s: any) => s.id as string))
    const invalid = requestedStoreIds.filter((id) => !validIds.has(id))
    if (invalid.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Store location(s) not in this product's franchise: ${invalid.join(", ")}`
      )
    }
  }

  // ── Reconcile on_menu overrides ──────────────────────────────────────────

  const { data: currentOverrides } = await query.graph({
    entity: StoreLocationProductLink.entryPoint,
    fields: ["store_location_id"],
    filters: { product_id: productId },
  })
  const currentOverrideIds = new Set(
    (currentOverrides as Array<{ store_location_id?: string }>)
      .map((l) => l.store_location_id)
      .filter((id): id is string => Boolean(id))
  )

  const toAddOverride = updates
    .filter((u) => u.on_menu && !currentOverrideIds.has(u.store_location_id))
    .map((u) => u.store_location_id)

  const toRemoveOverride = updates
    .filter((u) => !u.on_menu && currentOverrideIds.has(u.store_location_id))
    .map((u) => u.store_location_id)

  if (toAddOverride.length) {
    await remoteLink.create(
      toAddOverride.map((storeLocationId) => ({
        franchise: { store_location_id: storeLocationId },
        [Modules.PRODUCT]: { product_id: productId },
      }))
    )
  }
  if (toRemoveOverride.length) {
    await remoteLink.dismiss(
      toRemoveOverride.map((storeLocationId) => ({
        franchise: { store_location_id: storeLocationId },
        [Modules.PRODUCT]: { product_id: productId },
      }))
    )
  }

  // ── Reconcile inventory levels ────────────────────────────────────────────

  const storeIdsWithQtyUpdate = updates
    .filter((u) => u.quantity != null)
    .map((u) => u.store_location_id)

  if (storeIdsWithQtyUpdate.length) {
    // Resolve stock locations
    const { data: slStockLinks } = await query.graph({
      entity: StoreLocationStockLocationLink.entryPoint,
      fields: ["store_location_id", "stock_location_id"],
      filters: { store_location_id: storeIdsWithQtyUpdate },
    })

    type SlStockLink = { store_location_id: string; stock_location_id: string }
    const stockLocById = new Map<string, string>(
      (slStockLinks as SlStockLink[]).map((l) => [
        l.store_location_id,
        l.stock_location_id,
      ])
    )

    // Resolve inventory items
    const { data: variantData } = await query.graph({
      entity: "product_variant",
      fields: ["id", "inventory_items.id"],
      filters: { product_id: [productId] },
    })

    const inventoryItemIds = Array.from(
      new Set(
        (variantData as Array<{ inventory_items?: Array<{ id?: string }> }>).flatMap(
          (v) => (v.inventory_items ?? []).map((i) => i.id).filter(Boolean) as string[]
        )
      )
    )

    for (const update of updates) {
      if (update.quantity == null) continue
      const stockLocationId = stockLocById.get(update.store_location_id)
      if (!stockLocationId) continue

      for (const inventoryItemId of inventoryItemIds) {
        const existing = await inventoryService.listInventoryLevels({
          inventory_item_id: inventoryItemId,
          location_id: stockLocationId,
        })

        if (existing.length) {
          await inventoryService.updateInventoryLevels(
            existing[0].id,
            { stocked_quantity: update.quantity }
          )
        } else {
          await inventoryService.createInventoryLevels([{
            inventory_item_id: inventoryItemId,
            location_id: stockLocationId,
            stocked_quantity: update.quantity,
          }])
        }
      }
    }
  }

  // Return the updated state
  return GET(req, res)
}
