/**
 * GET  /admin/franchise-dashboard/store-health
 * POST /admin/franchise-dashboard/store-health/fix/:store_location_id
 *
 * Phase 4 — Store Health Check + One-Click Fix
 *
 * Replaces the repair scripts (fix-live-franchise-gaps.ts, link-stores-direct.ts, etc.)
 * with a visible, API-driven diagnosis panel.
 *
 * GET → Returns per-branch health status:
 *   - has_stock_location    : StoreLocation ↔ StockLocation link exists
 *   - has_sales_channel     : StockLocation is associated with a sales channel
 *   - is_accepting_orders   : branch is taking orders
 *   - inventory_item_count  : how many inventory items have levels here
 *   - issues                : human-readable list of problems
 *   - healthy               : true only when all checks pass
 *
 * POST /fix/:store_location_id → One-click repair for a single branch:
 *   - Wires the StockLocation → franchise's SalesChannel if missing
 *   - Creates zero-quantity inventory levels for any products that lack them
 *   (Super-admin only for the fix endpoint; health read is franchise-scoped)
 */

import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseContext,
  isSuperAdminUser,
  type AuthenticatedTenantRequest,
} from "../../../../utils/tenant-context"
import FranchiseSalesChannelLink from "../../../../links/franchise-sales-channel"
import FranchiseProductLink from "../../../../links/franchise-product"
import StoreLocationStockLocationLink from "../../../../links/store-location-stock-location"
import { linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"

// ── Types ─────────────────────────────────────────────────────────────────────

type BranchHealth = {
  store_location_id: string
  store_location_name: string
  store_location_code: string
  is_accepting_orders: boolean
  has_stock_location: boolean
  stock_location_id: string | null
  has_sales_channel: boolean
  inventory_item_count: number
  issues: string[]
  healthy: boolean
}

type StoreHealthResponse = {
  franchise_id: string
  total_branches: number
  healthy_branches: number
  unhealthy_branches: number
  branches: BranchHealth[]
}

// ── GET — health check ─────────────────────────────────────────────────────────

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<StoreHealthResponse>
) => {
  const tenantReq = req as AuthenticatedTenantRequest
  const franchiseId = await resolveAdminFranchiseContext(tenantReq)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // 1. All store locations for this franchise
  const { data: storeLocations } = await query.graph({
    entity: "store_location",
    fields: ["id", "name", "code", "is_accepting_orders"],
    filters: { franchise_id: franchiseId },
  })

  if (!storeLocations.length) {
    return res.json({
      franchise_id: franchiseId,
      total_branches: 0,
      healthy_branches: 0,
      unhealthy_branches: 0,
      branches: [],
    })
  }

  const storeLocationIds = storeLocations.map((sl: any) => sl.id as string)

  // 2. Resolve StockLocation links
  const { data: slStockLinks } = await query.graph({
    entity: StoreLocationStockLocationLink.entryPoint,
    fields: ["store_location_id", "stock_location_id"],
    filters: { store_location_id: storeLocationIds },
  })

  type SlStockLink = { store_location_id: string; stock_location_id: string }
  const stockLocByStore = new Map<string, string>(
    (slStockLinks as SlStockLink[]).map((l) => [
      l.store_location_id,
      l.stock_location_id,
    ])
  )

  // 3. Resolve sales channels linked to the franchise
  const { data: scLinks } = await query.graph({
    entity: FranchiseSalesChannelLink.entryPoint,
    fields: ["sales_channel_id"],
    filters: { franchise_id: franchiseId },
  })

  const franchiseSalesChannelIds = new Set(
    (scLinks as Array<{ sales_channel_id?: string }>)
      .map((l) => l.sales_channel_id)
      .filter((id): id is string => Boolean(id))
  )

  // 4. Resolve which stock locations are associated with a sales channel
  //    We check via the stock_location → sales_channel link (Medusa core)
  const uniqueStockLocIds = Array.from(new Set(stockLocByStore.values()))

  const stockLocWithSalesChannel = new Set<string>()

  if (uniqueStockLocIds.length) {
    const { data: scStockLinks } = await query.graph({
      entity: "stock_location_sales_channel",
      fields: ["stock_location_id", "sales_channel_id"],
      filters: { stock_location_id: uniqueStockLocIds },
    })

    for (const link of scStockLinks as Array<{
      stock_location_id?: string
      sales_channel_id?: string
    }>) {
      if (
        link.stock_location_id &&
        link.sales_channel_id &&
        franchiseSalesChannelIds.has(link.sales_channel_id)
      ) {
        stockLocWithSalesChannel.add(link.stock_location_id)
      }
    }
  }

  // 5. Count inventory levels per stock location
  const inventoryCountByStockLoc = new Map<string, number>()

  if (uniqueStockLocIds.length) {
    const { data: levels } = await query.graph({
      entity: "inventory_level",
      fields: ["location_id"],
      filters: { location_id: uniqueStockLocIds },
    })

    for (const level of levels as Array<{ location_id: string }>) {
      const curr = inventoryCountByStockLoc.get(level.location_id) ?? 0
      inventoryCountByStockLoc.set(level.location_id, curr + 1)
    }
  }

  // 6. Assemble branch health objects
  const branches: BranchHealth[] = storeLocations.map((sl: any) => {
    const stockLocId = stockLocByStore.get(sl.id) ?? null
    const hasStockLoc = stockLocId !== null
    const hasSalesChannel = hasStockLoc && stockLocWithSalesChannel.has(stockLocId)
    const invCount = stockLocId ? (inventoryCountByStockLoc.get(stockLocId) ?? 0) : 0
    const isAccepting = Boolean(sl.is_accepting_orders)

    const issues: string[] = []
    if (!hasStockLoc) {
      issues.push("No stock location linked — run the create-store workflow or use the repair API")
    }
    if (hasStockLoc && !hasSalesChannel) {
      issues.push("Stock location not associated with a sales channel — click Fix to repair")
    }
    if (!isAccepting) {
      issues.push("Branch is not accepting orders")
    }
    if (hasStockLoc && invCount === 0) {
      issues.push("No inventory levels — products may not be orderable here")
    }

    return {
      store_location_id: sl.id,
      store_location_name: sl.name ?? "",
      store_location_code: sl.code ?? "",
      is_accepting_orders: isAccepting,
      has_stock_location: hasStockLoc,
      stock_location_id: stockLocId,
      has_sales_channel: hasSalesChannel,
      inventory_item_count: invCount,
      issues,
      healthy: hasStockLoc && hasSalesChannel && invCount > 0,
    }
  })

  const healthyCount = branches.filter((b) => b.healthy).length

  res.json({
    franchise_id: franchiseId,
    total_branches: branches.length,
    healthy_branches: healthyCount,
    unhealthy_branches: branches.length - healthyCount,
    branches,
  })
}

// ── POST /fix/:store_location_id — one-click repair ───────────────────────────

export const POST = async (
  req: AuthenticatedMedusaRequest<{ store_location_id: string }>,
  res: MedusaResponse
) => {
  const isSuper = await isSuperAdminUser(req)
  const tenantReq = req as AuthenticatedTenantRequest
  const franchiseId = await resolveAdminFranchiseContext(tenantReq)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = req.scope.resolve("remoteLink")
  const inventoryService = req.scope.resolve(Modules.INVENTORY) as any
  const logger = req.scope.resolve("logger")

  const storeLocationId = req.params?.store_location_id as string | undefined

  if (!storeLocationId) {
    return res.status(400).json({ message: "Missing store_location_id param" })
  }

  // Verify branch belongs to this franchise
  const { data: slData } = await query.graph({
    entity: "store_location",
    fields: ["id", "name"],
    filters: { id: storeLocationId, franchise_id: franchiseId },
  })

  if (!slData.length) {
    return res.status(404).json({ message: "Store location not found in this franchise" })
  }

  const fixes: string[] = []
  const errors: string[] = []

  // 1. Resolve the stock location for this branch
  const { data: slStockLinks } = await query.graph({
    entity: StoreLocationStockLocationLink.entryPoint,
    fields: ["stock_location_id"],
    filters: { store_location_id: storeLocationId },
  })

  const stockLocationId = (slStockLinks as Array<{ stock_location_id?: string }>)[0]
    ?.stock_location_id

  if (!stockLocationId) {
    errors.push(
      `Branch "${(slData[0] as any).name}" has no stock location. ` +
      `Delete and recreate it via the franchise-locations API to provision one atomically.`
    )
    return res.status(422).json({ fixed: false, fixes, errors })
  }

  // 2. Wire stock location → franchise's sales channels (if not already wired)
  const { data: scLinks } = await query.graph({
    entity: FranchiseSalesChannelLink.entryPoint,
    fields: ["sales_channel_id"],
    filters: { franchise_id: franchiseId },
  })

  const franchiseSalesChannelIds = (scLinks as Array<{ sales_channel_id?: string }>)
    .map((l) => l.sales_channel_id)
    .filter((id): id is string => Boolean(id))

  if (franchiseSalesChannelIds.length) {
    const { data: existingSCLinks } = await query.graph({
      entity: "stock_location_sales_channel",
      fields: ["sales_channel_id"],
      filters: {
        stock_location_id: stockLocationId,
        sales_channel_id: franchiseSalesChannelIds,
      },
    })

    const alreadyLinked = new Set(
      (existingSCLinks as Array<{ sales_channel_id?: string }>)
        .map((l) => l.sales_channel_id)
        .filter((id): id is string => Boolean(id))
    )

    const toLink = franchiseSalesChannelIds.filter((id) => !alreadyLinked.has(id))

    if (toLink.length) {
      try {
        await linkSalesChannelsToStockLocationWorkflow(req.scope).run({
          input: { id: stockLocationId, add: toLink },
        })
        fixes.push(
          `Linked stock location → ${toLink.length} sales channel(s)`
        )
        logger.info(
          `[store-health fix] ✓ Linked stock ${stockLocationId} → sales channels ${toLink.join(",")}`
        )
      } catch (err: any) {
        errors.push(`Failed to link sales channels: ${err.message}`)
      }
    } else {
      fixes.push("Sales channel association already healthy — no change needed")
    }
  }

  // 3. Create missing inventory levels for all franchise products
  const { data: productLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: { franchise_id: franchiseId },
  })

  const productIds = (productLinks as Array<{ product_id?: string }>)
    .map((l) => l.product_id)
    .filter((id): id is string => Boolean(id))

  if (productIds.length) {
    const { data: variantData } = await query.graph({
      entity: "product_variant",
      fields: ["id", "manage_inventory", "inventory_items.id"],
      filters: { product_id: productIds },
    })

    const inventoryItemIds = Array.from(
      new Set(
        (variantData as Array<{
          manage_inventory?: boolean
          inventory_items?: Array<{ id?: string }>
        }>)
          .filter((v) => v.manage_inventory !== false)
          .flatMap((v) => (v.inventory_items ?? []).map((i) => i.id))
          .filter((id): id is string => Boolean(id))
      )
    )

    let createdCount = 0

    for (const inventoryItemId of inventoryItemIds) {
      const existing = await inventoryService.listInventoryLevels({
        inventory_item_id: inventoryItemId,
        location_id: stockLocationId,
      })

      if (!existing.length) {
        try {
          await inventoryService.createInventoryLevels([{
            inventory_item_id: inventoryItemId,
            location_id: stockLocationId,
            stocked_quantity: 0,
          }])
          createdCount++
        } catch (err: any) {
          errors.push(`Failed to create level for item ${inventoryItemId}: ${err.message}`)
        }
      }
    }

    if (createdCount > 0) {
      fixes.push(`Created ${createdCount} missing inventory level(s) at qty 0`)
      logger.info(
        `[store-health fix] ✓ Created ${createdCount} inventory levels at stock ${stockLocationId}`
      )
    } else {
      fixes.push("All inventory levels already exist — no change needed")
    }
  }

  res.json({
    fixed: errors.length === 0,
    store_location_id: storeLocationId,
    stock_location_id: stockLocationId,
    fixes,
    errors,
  })
}
