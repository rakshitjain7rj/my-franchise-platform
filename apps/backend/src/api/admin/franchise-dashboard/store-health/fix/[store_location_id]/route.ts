/**
 * POST /admin/franchise-dashboard/store-health/fix/:store_location_id
 *
 * One-click repair for a single branch:
 *   - Ensures franchise → SalesChannel link exists (creates Default SC link if missing)
 *   - Wires StockLocation → franchise SalesChannel(s) if missing
 *   - Creates zero-quantity inventory levels for products that lack them
 */

import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseContext,
  type AuthenticatedTenantRequest,
} from "../../../../../../utils/tenant-context"
import FranchiseSalesChannelLink from "../../../../../../links/franchise-sales-channel"
import FranchiseProductLink from "../../../../../../links/franchise-product"
import StoreLocationStockLocationLink from "../../../../../../links/store-location-stock-location"
import { linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const tenantReq = req as AuthenticatedTenantRequest
  const franchiseId = await resolveAdminFranchiseContext(tenantReq)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = req.scope.resolve("remoteLink") as {
    create: (data: Record<string, unknown>) => Promise<unknown>
  }
  const inventoryService = req.scope.resolve(Modules.INVENTORY) as {
    listInventoryLevels: (
      filters: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ inventory_item_id?: string; location_id?: string }>>
    createInventoryLevels: (
      data: Array<{
        inventory_item_id: string
        location_id: string
        stocked_quantity: number
      }>
    ) => Promise<unknown>
  }
  const logger = req.scope.resolve("logger") as {
    info: (msg: string) => void
    warn: (msg: string) => void
  }

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
    return res
      .status(404)
      .json({ message: "Store location not found in this franchise" })
  }

  const fixes: string[] = []
  const errors: string[] = []

  // 1. Resolve the stock location for this branch
  const { data: slStockLinks } = await query.graph({
    entity: StoreLocationStockLocationLink.entryPoint,
    fields: ["stock_location_id"],
    filters: { store_location_id: storeLocationId },
  })

  const stockLocationId = (
    slStockLinks as Array<{ stock_location_id?: string }>
  )[0]?.stock_location_id

  if (!stockLocationId) {
    errors.push(
      `Branch "${(slData[0] as { name?: string }).name}" has no stock location. ` +
        `Delete and recreate it via the franchise-locations API to provision one atomically.`
    )
    return res.status(422).json({ fixed: false, fixes, errors })
  }

  // 2. Ensure franchise has at least one sales channel; repair link if missing
  let franchiseSalesChannelIds = await resolveFranchiseSalesChannelIds(
    query,
    franchiseId
  )

  if (!franchiseSalesChannelIds.length) {
    try {
      const defaultScId = await resolveDefaultSalesChannelId(query)
      if (!defaultScId) {
        errors.push(
          "Franchise has no sales channel and no Default Sales Channel exists to link."
        )
      } else {
        await remoteLink.create({
          franchise: { franchise_id: franchiseId },
          [Modules.SALES_CHANNEL]: { sales_channel_id: defaultScId },
        })
        franchiseSalesChannelIds = [defaultScId]
        fixes.push(`Linked franchise → sales channel ${defaultScId}`)
        logger.info(
          `[store-health fix] ✓ Linked franchise ${franchiseId} → SC ${defaultScId}`
        )
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      // Link may already exist (race) — re-query
      franchiseSalesChannelIds = await resolveFranchiseSalesChannelIds(
        query,
        franchiseId
      )
      if (!franchiseSalesChannelIds.length) {
        errors.push(`Failed to link franchise sales channel: ${message}`)
      }
    }
  }

  // 3. Wire stock location → franchise sales channels
  if (franchiseSalesChannelIds.length) {
    const alreadyLinked = await listLinkedSalesChannelIds(
      req.scope,
      stockLocationId
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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        // Idempotent: if already linked, treat as success
        const after = await listLinkedSalesChannelIds(req.scope, stockLocationId)
        const stillMissing = toLink.filter((id) => !after.has(id))
        if (stillMissing.length) {
          errors.push(`Failed to link sales channels: ${message}`)
        } else {
          fixes.push("Sales channel association already healthy — no change needed")
        }
      }
    } else {
      fixes.push("Sales channel association already healthy — no change needed")
    }
  }

  // 4. Create missing inventory levels in bulk (avoid N sequential queries)
  const { data: productLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: { franchise_id: franchiseId },
  })

  const productIds = (productLinks as Array<{ product_id?: string }>)
    .map((l) => l.product_id)
    .filter((id): id is string => Boolean(id))

  if (productIds.length) {
    // Prefer inventory_items.inventory_item_id. Bare inventory_items.id is the
    // product_variant_inventory_item *link* id (pvitem_…), which is not a valid
    // inventory_level.inventory_item_id (must be iitem_…).
    const { data: variantData } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "manage_inventory",
        "inventory_items.id",
        "inventory_items.inventory_item_id",
      ],
      filters: { product_id: productIds },
    })

    const inventoryItemIds = Array.from(
      new Set(
        (
          variantData as Array<{
            manage_inventory?: boolean
            inventory_items?: Array<{ id?: string; inventory_item_id?: string }>
          }>
        )
          .filter((v) => v.manage_inventory !== false)
          .flatMap((v) =>
            (v.inventory_items ?? []).map((item) => {
              if (item.inventory_item_id?.startsWith("iitem_")) {
                return item.inventory_item_id
              }
              if (item.id?.startsWith("iitem_")) return item.id
              return undefined
            })
          )
          .filter((id): id is string => Boolean(id))
      )
    )

    if (inventoryItemIds.length) {
      let existingLevels: Array<{
        inventory_item_id?: string
        location_id?: string
      }> = []
      try {
        existingLevels = await inventoryService.listInventoryLevels(
          { location_id: stockLocationId },
          { take: 500_000 }
        )
      } catch {
        existingLevels = []
      }

      const haveLevel = new Set(
        existingLevels
          .map((l) => l.inventory_item_id)
          .filter((id): id is string => Boolean(id))
      )

      const toCreate = inventoryItemIds
        .filter((id) => !haveLevel.has(id))
        .map((inventory_item_id) => ({
          inventory_item_id,
          location_id: stockLocationId,
          stocked_quantity: 0,
        }))

      let createdCount = 0
      let failedCount = 0
      const BATCH = 200
      for (let i = 0; i < toCreate.length; i += BATCH) {
        const batch = toCreate.slice(i, i + BATCH)
        try {
          await inventoryService.createInventoryLevels(batch)
          createdCount += batch.length
        } catch {
          for (const row of batch) {
            try {
              await inventoryService.createInventoryLevels([row])
              createdCount++
            } catch (inner: unknown) {
              failedCount++
              // Cap noisy errors (large catalogs) — keep the first few
              if (errors.length < 5) {
                const message =
                  inner instanceof Error ? inner.message : String(inner)
                errors.push(
                  `Failed to create level for item ${row.inventory_item_id}: ${message}`
                )
              }
            }
          }
        }
      }

      if (createdCount > 0) {
        fixes.push(
          `Created ${createdCount} missing inventory level(s) at qty 0`
        )
        logger.info(
          `[store-health fix] ✓ Created ${createdCount} inventory levels at stock ${stockLocationId}`
        )
      } else if (failedCount === 0) {
        fixes.push("All inventory levels already exist — no change needed")
      }
      if (failedCount > 5) {
        errors.push(
          `…and ${failedCount - Math.min(5, failedCount)} more inventory level failures`
        )
      }
    } else {
      fixes.push("No inventory items resolved for franchise products")
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

// ── helpers ───────────────────────────────────────────────────────────────────

async function resolveFranchiseSalesChannelIds(
  query: {
    graph: (args: Record<string, unknown>) => Promise<{ data: unknown[] }>
  },
  franchiseId: string
): Promise<string[]> {
  const { data: scLinks } = await query.graph({
    entity: FranchiseSalesChannelLink.entryPoint,
    fields: ["sales_channel_id"],
    filters: { franchise_id: franchiseId },
  })
  return Array.from(
    new Set(
      (scLinks as Array<{ sales_channel_id?: string }>)
        .map((l) => l.sales_channel_id)
        .filter((id): id is string => Boolean(id))
    )
  )
}

async function resolveDefaultSalesChannelId(
  query: {
    graph: (args: Record<string, unknown>) => Promise<{ data: unknown[] }>
  }
): Promise<string | null> {
  const { data: byName } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
    filters: { name: "Default Sales Channel" },
  })
  const named = (byName as Array<{ id?: string }>)[0]?.id
  if (named) return named

  const { data: anySc } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
  })
  return (anySc as Array<{ id?: string }>)[0]?.id ?? null
}

async function listLinkedSalesChannelIds(
  scope: { resolve: (key: string) => unknown },
  stockLocationId: string
): Promise<Set<string>> {
  const linked = new Set<string>()
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (args: Record<string, unknown>) => Promise<{ data: unknown[] }>
  }

  // Prefer the real Medusa link table (sales_channel_stock_location)
  const candidateEntities = [
    "sales_channel_stock_location",
    "stock_location_sales_channel",
    "link_sales_channel_stock_location",
  ]
  for (const entity of candidateEntities) {
    try {
      const { data } = await query.graph({
        entity,
        fields: ["sales_channel_id"],
        filters: { stock_location_id: stockLocationId },
      })
      for (const row of data as Array<{ sales_channel_id?: string }>) {
        if (row.sales_channel_id) linked.add(row.sales_channel_id)
      }
      break
    } catch {
      // try next
    }
  }

  // Admin-style graph path (matches live /admin/stock-locations fields)
  if (!linked.size) {
    try {
      const { data: locs } = await query.graph({
        entity: "stock_location",
        fields: ["id", "sales_channels.id"],
        filters: { id: stockLocationId },
      })
      for (const loc of locs as Array<{
        sales_channels?: Array<{ id?: string } | null> | null
      }>) {
        for (const sc of loc.sales_channels ?? []) {
          if (sc?.id) linked.add(sc.id)
        }
      }
    } catch {
      // ignore
    }
  }

  // Module relations last
  if (!linked.size) {
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
        { id: stockLocationId },
        { relations: ["sales_channels"], take: 1 }
      )
      for (const sc of locs[0]?.sales_channels ?? []) {
        if (sc.id) linked.add(sc.id)
      }
    } catch {
      // ignore
    }
  }

  return linked
}
