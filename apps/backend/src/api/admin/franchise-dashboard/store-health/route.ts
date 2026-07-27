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

  // 3. Franchise → sales channels (for diagnostics + preferred SC match)
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

  // 4. Resolve which stock locations have sales-channel associations.
  //    Prefer the Stock Location module (relations) — it is the reliable path.
  //    Query-graph entity names vary across Medusa versions and previously
  //    short-circuited the fallback, producing false "not associated" alerts
  //    even when admin stock-location APIs showed channels linked.
  const uniqueStockLocIds = Array.from(new Set(stockLocByStore.values()))
  const stockLocWithSalesChannel = new Set<string>()
  const stockLocWithFranchiseSalesChannel = new Set<string>()

  if (uniqueStockLocIds.length) {
    let moduleResolved = false
    try {
      const stockLocationModule = req.scope.resolve(Modules.STOCK_LOCATION) as {
        listStockLocations: (
          filters: Record<string, unknown>,
          config?: Record<string, unknown>
        ) => Promise<
          Array<{
            id: string
            sales_channels?: Array<{ id?: string }>
          }>
        >
      }
      const locs = await stockLocationModule.listStockLocations(
        { id: uniqueStockLocIds },
        { relations: ["sales_channels"], take: uniqueStockLocIds.length }
      )
      for (const loc of locs) {
        const channels = loc.sales_channels ?? []
        if (channels.some((sc) => Boolean(sc.id))) {
          stockLocWithSalesChannel.add(loc.id)
        }
        if (
          channels.some(
            (sc) => sc.id && franchiseSalesChannelIds.has(sc.id)
          )
        ) {
          stockLocWithFranchiseSalesChannel.add(loc.id)
        }
      }
      moduleResolved = true
    } catch {
      // fall through to query.graph
    }

    if (!moduleResolved) {
      const candidateEntities = [
        "stock_location_sales_channel",
        "sales_channel_stock_location",
        "link_sales_channel_stock_location",
      ]
      for (const entity of candidateEntities) {
        try {
          const { data: scStockLinks } = await query.graph({
            entity,
            fields: ["stock_location_id", "sales_channel_id"],
            filters: { stock_location_id: uniqueStockLocIds },
          })
          for (const link of scStockLinks as Array<{
            stock_location_id?: string
            sales_channel_id?: string
          }>) {
            if (link.stock_location_id && link.sales_channel_id) {
              stockLocWithSalesChannel.add(link.stock_location_id)
              if (franchiseSalesChannelIds.has(link.sales_channel_id)) {
                stockLocWithFranchiseSalesChannel.add(link.stock_location_id)
              }
            }
          }
          break
        } catch {
          // try next entity name
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
      // Fall back to Query graph if the module path fails
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
      // Operational truth: any SC on the stock location is enough for Medusa
      // fulfillment. Prefer franchise SC match when franchise has SCs linked.
      const hasAnySc =
        hasStockLoc && stockLocWithSalesChannel.has(stockLocId!)
      const hasFranchiseSc =
        hasStockLoc && stockLocWithFranchiseSalesChannel.has(stockLocId!)
      const hasSalesChannel =
        franchiseSalesChannelIds.size > 0 ? hasFranchiseSc : hasAnySc
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
        if (hasAnySc && franchiseSalesChannelIds.size > 0) {
          issues.push(
            "Stock location sales channel does not match franchise channel — click Fix to repair"
          )
        } else {
          issues.push(
            "Stock location not associated with a sales channel — click Fix to repair"
          )
        }
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
