/**
 * GET  /admin/franchise-dashboard/store-health
 *
 * Phase 4 — Store Health Check
 *
 * Returns per-branch health status:
 *   - has_stock_location    : StoreLocation ↔ StockLocation link exists
 *   - has_sales_channel     : StockLocation is associated with a sales channel
 *   - is_accepting_orders   : branch is taking orders
 *   - inventory_item_count  : how many inventory items have levels here
 *   - issues                : human-readable list of problems
 *   - healthy               : true only when all checks pass
 *
 * One-click repair lives at:
 *   POST /admin/franchise-dashboard/store-health/fix/:store_location_id
 */

import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseContext,
  type AuthenticatedTenantRequest,
} from "../../../../utils/tenant-context"
import FranchiseSalesChannelLink from "../../../../links/franchise-sales-channel"
import StoreLocationStockLocationLink from "../../../../links/store-location-stock-location"

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
  /** Present when franchise itself is missing a sales-channel link */
  franchise_issues?: string[]
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

  const storeLocationIds = storeLocations.map((sl: { id: string }) => sl.id)

  // 2. Resolve StockLocation links
  const { data: slStockLinks } = await query.graph({
    entity: StoreLocationStockLocationLink.entryPoint,
    fields: ["store_location_id", "stock_location_id"],
    filters: { store_location_id: storeLocationIds },
  })

  type SlStockLink = { store_location_id: string; stock_location_id: string }
  const stockLocByStore = new Map<string, string>(
    (slStockLinks as Array<SlStockLink>).map((l) => [
      l.store_location_id,
      l.stock_location_id,
    ])
  )

  // 3. Franchise → sales channels (diagnostics + preferred match)
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

  const franchiseIssues: string[] = []
  if (!franchiseSalesChannelIds.size) {
    franchiseIssues.push(
      "Franchise is not linked to a sales channel — Fix will attach Default Sales Channel"
    )
  }

  // 4. Resolve stock ↔ sales-channel associations via the real link table.
  //    Do not trust stock-location module relations alone — they often return
  //    empty sales_channels even when sales_channel_stock_location has rows.
  const uniqueStockLocIds = Array.from(new Set(stockLocByStore.values()))
  const stockLocWithSalesChannel = new Set<string>()
  const stockLocWithFranchiseSalesChannel = new Set<string>()

  if (uniqueStockLocIds.length) {
    const scByStock = await resolveStockSalesChannels(
      req.scope,
      uniqueStockLocIds
    )
    for (const [stockId, channelIds] of scByStock) {
      if (channelIds.size) {
        stockLocWithSalesChannel.add(stockId)
      }
      for (const scId of channelIds) {
        if (franchiseSalesChannelIds.has(scId)) {
          stockLocWithFranchiseSalesChannel.add(stockId)
          break
        }
      }
    }
  }

  // 5. Count inventory levels per stock location (Inventory module is SoT)
  const inventoryCountByStockLoc = new Map<string, number>()

  if (uniqueStockLocIds.length) {
    try {
      const inventoryService = req.scope.resolve(Modules.INVENTORY) as {
        listInventoryLevels: (
          filters: Record<string, unknown>,
          config?: Record<string, unknown>
        ) => Promise<Array<{ location_id?: string }>>
      }
      const levels = await inventoryService.listInventoryLevels(
        { location_id: uniqueStockLocIds },
        { take: 200_000 }
      )
      for (const level of levels) {
        if (!level.location_id) continue
        const curr = inventoryCountByStockLoc.get(level.location_id) ?? 0
        inventoryCountByStockLoc.set(level.location_id, curr + 1)
      }
    } catch {
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
  }

  // 6. Assemble branch health objects
  const branches: BranchHealth[] = storeLocations.map(
    (sl: {
      id: string
      name?: string
      code?: string
      is_accepting_orders?: boolean
    }) => {
      const stockLocId = stockLocByStore.get(sl.id) ?? null
      const hasStockLoc = stockLocId !== null
      const hasAnySc =
        hasStockLoc && stockLocWithSalesChannel.has(stockLocId!)
      const hasFranchiseSc =
        hasStockLoc && stockLocWithFranchiseSalesChannel.has(stockLocId!)
      // Prefer franchise SC match when franchise has channels; otherwise any SC.
      const hasSalesChannel =
        franchiseSalesChannelIds.size > 0
          ? hasFranchiseSc || hasAnySc
          : hasAnySc
      const invCount = stockLocId
        ? (inventoryCountByStockLoc.get(stockLocId) ?? 0)
        : 0
      const isAccepting = Boolean(sl.is_accepting_orders)

      const issues: string[] = []
      if (!hasStockLoc) {
        issues.push(
          "No stock location linked — run the create-store workflow or use the repair API"
        )
      }
      if (hasStockLoc && !hasSalesChannel) {
        issues.push(
          "Stock location not associated with a sales channel — click Fix to repair"
        )
      } else if (
        hasStockLoc &&
        hasAnySc &&
        franchiseSalesChannelIds.size > 0 &&
        !hasFranchiseSc
      ) {
        issues.push(
          "Stock location sales channel does not match franchise channel — click Fix to repair"
        )
      }
      if (!isAccepting) {
        issues.push("Branch is not accepting orders")
      }
      if (hasStockLoc && invCount === 0) {
        issues.push("No inventory levels — products may not be orderable here")
      }

      // Healthy = stock wired + usable SC + inventory present.
      // Soft franchise-SC mismatch is still listed, but if any SC is present
      // the branch is operational for Medusa fulfillment.
      const healthy = hasStockLoc && hasSalesChannel && invCount > 0

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
        healthy,
      }
    }
  )

  const healthyCount = branches.filter((b) => b.healthy).length

  res.json({
    franchise_id: franchiseId,
    total_branches: branches.length,
    healthy_branches: healthyCount,
    unhealthy_branches: branches.length - healthyCount,
    branches,
    ...(franchiseIssues.length ? { franchise_issues: franchiseIssues } : {}),
  })
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Map stock_location_id → set of sales_channel_ids.
 * Prefer the real Medusa link table; merge module relations as a fallback.
 */
async function resolveStockSalesChannels(
  scope: { resolve: (key: string) => unknown },
  stockLocationIds: string[]
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>()
  const add = (stockId: string, scId: string) => {
    if (!result.has(stockId)) result.set(stockId, new Set())
    result.get(stockId)!.add(scId)
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (args: Record<string, unknown>) => Promise<{ data: unknown[] }>
  }

  // Known Medusa v2 link entity / table name first
  const candidateEntities = [
    "sales_channel_stock_location",
    "stock_location_sales_channel",
    "link_sales_channel_stock_location",
  ]

  for (const entity of candidateEntities) {
    try {
      const { data } = await query.graph({
        entity,
        fields: ["stock_location_id", "sales_channel_id"],
        filters: { stock_location_id: stockLocationIds },
      })
      for (const row of data as Array<{
        stock_location_id?: string
        sales_channel_id?: string
      }>) {
        if (row.stock_location_id && row.sales_channel_id) {
          add(row.stock_location_id, row.sales_channel_id)
        }
      }
      // Entity existed (no throw). Stop even if empty — don't thrash aliases.
      break
    } catch {
      // try next name
    }
  }

  // Admin-style graph: stock_location → sales_channels (matches
  // /admin/stock-locations?fields=id,*sales_channels which already works live)
  if (!result.size) {
    try {
      const { data: locs } = await query.graph({
        entity: "stock_location",
        fields: ["id", "sales_channels.id"],
        filters: { id: stockLocationIds },
      })
      for (const loc of locs as Array<{
        id?: string
        sales_channels?: Array<{ id?: string } | null> | null
      }>) {
        if (!loc.id) continue
        for (const sc of loc.sales_channels ?? []) {
          if (sc?.id) add(loc.id, sc.id)
        }
      }
    } catch {
      // fall through
    }
  }

  // Module relations as a last resort
  if (!result.size) {
    try {
      const stockLocationModule = scope.resolve(Modules.STOCK_LOCATION) as {
        listStockLocations: (
          filters: Record<string, unknown>,
          config?: Record<string, unknown>
        ) => Promise<
          Array<{ id: string; sales_channels?: Array<{ id?: string }> }>
        >
      }
      const locs = await stockLocationModule.listStockLocations(
        { id: stockLocationIds },
        { relations: ["sales_channels"], take: stockLocationIds.length }
      )
      for (const loc of locs) {
        for (const sc of loc.sales_channels ?? []) {
          if (sc.id) add(loc.id, sc.id)
        }
      }
    } catch {
      // leave map as-is
    }
  }

  return result
}
