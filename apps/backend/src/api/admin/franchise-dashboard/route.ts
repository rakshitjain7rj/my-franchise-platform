import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { IProductModuleService } from "@medusajs/framework/types"
import FranchiseProductLink from "../../../links/franchise-product"
import FranchiseStoreLink from "../../../links/franchise-store"
import StoreLocationStockLocationLink from "../../../links/store-location-stock-location"
import {
  resolveAdminFranchiseContext,
  resolveAdminFranchiseIds,
  type AuthenticatedTenantRequest,
} from "../../../utils/tenant-context"

type InventoryLevelRecord = {
  inventory_item_id: string
  location_id: string
  stocked_quantity: number
  reserved_quantity: number
  incoming_quantity: number
}

type DashboardResponse = {
  franchise: {
    id: string
    name: string
    code: string
    is_active: boolean
  } | null
  allowed_franchise_ids: string[]
  overview: {
    product_count: number
    store_count: number
    is_active: boolean
  }
  inventory: {
    /**
     * Rolled-up total of `stocked_quantity` across every inventory level
     * that belongs to a stock location linked to this franchise's stores.
     * Only counts items whose variants are tied to franchise-owned products.
     */
    total_stocked_quantity: number
    total_reserved_quantity: number
    total_incoming_quantity: number
    /** Per-item stock breakdown — useful for low-stock alerts in the UI. */
    items: Array<{
      inventory_item_id: string
      location_id: string
      stocked_quantity: number
      reserved_quantity: number
      incoming_quantity: number
    }>
  }
  products: Array<{
    id: string
    title?: string
    status?: string
  }>
  pagination: {
    count: number
    limit: number
    offset: number
  }
  stores: Array<{
    id: string
    name?: string
  }>
  alerts: Array<{
    severity: "info" | "warning"
    message: string
  }>
}

const parseNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return parsed
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<DashboardResponse>
) => {
  const tenantReq = req as AuthenticatedTenantRequest
  const franchiseId = await resolveAdminFranchiseContext(tenantReq)
  const allowedFranchiseIds = await resolveAdminFranchiseIds(tenantReq)

  const limit = parseNumber(req.query.limit, 10)
  const offset = parseNumber(req.query.offset, 0)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const productModuleService = req.scope.resolve<IProductModuleService>("product")

  // ── Franchise metadata ─────────────────────────────────────────────────────────────
  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id", "name", "code", "is_active"],
    filters: { id: franchiseId },
  })

  const franchise = (franchises?.[0] as DashboardResponse["franchise"]) ?? null

  // ── Franchise-owned products ─────────────────────────────────────────────────────
  const { data: franchiseProductLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: { franchise_id: franchiseId },
  })

  const productIds = franchiseProductLinks
    .map((link: { product_id?: string }) => link.product_id)
    .filter((productId): productId is string => Boolean(productId))
    .sort() // Deterministic sort by ID

  const paginatedProductIds = productIds.slice(offset, offset + limit)
  const productsResult = paginatedProductIds.length
    ? await productModuleService.listProducts({ id: paginatedProductIds })
    : []

  // Ensure products list preserves the deterministic sorted IDs order
  const products = paginatedProductIds
    .map((id) => productsResult.find((p) => p.id === id))
    .filter((p): p is typeof productsResult[number] => Boolean(p))

  // ── Franchise store locations (physical branches) ────────────────────────────────
  const { data: storeLocations } = await query.graph({
    entity: "store_location",
    fields: ["id", "name", "code", "is_active"],
    filters: { franchise_id: franchiseId },
  })

  const storeLocationIds = storeLocations.map((sl) => sl.id)

  // ── Live inventory metrics ──────────────────────────────────────────────────────────
  //
  // Query chain:
  //   1. Resolve physical storage locations belonging to this franchise's store locations.
  //   2. Query `inventory_level` filtered by those location IDs.
  //   3. Further filter by inventory items whose variants belong to
  //      franchise-owned products, preventing cross-tenant data leakage.
  //
  let inventoryMetrics: DashboardResponse["inventory"] = {
    total_stocked_quantity: 0,
    total_reserved_quantity: 0,
    total_incoming_quantity: 0,
    items: [],
  }

  if (storeLocationIds.length) {
    let locationIds: string[] = []

    const { data: slStockLinks } = await query.graph({
      entity: StoreLocationStockLocationLink.entryPoint,
      fields: ["stock_location_id"],
      filters: { store_location_id: storeLocationIds },
    })

    type SLStockLink = { stock_location_id?: string }
    locationIds = Array.from(
      new Set(
        (slStockLinks as unknown as SLStockLink[])
          .map((link) => link.stock_location_id)
          .filter((id): id is string => Boolean(id))
      )
    )

    if (locationIds.length) {
      // Step 4 — Fetch inventory levels for these locations.
      const { data: allLevels } = await query.graph({
        entity: "inventory_level",
        fields: [
          "id",
          "inventory_item_id",
          "location_id",
          "stocked_quantity",
          "reserved_quantity",
          "incoming_quantity",
        ],
        filters: {
          location_id: locationIds,
        },
      })

      // Step 5 — Tenant-scope: only include levels whose inventory item is
      // linked to a franchise-owned product variant.
      let franchiseInventoryItemIds: Set<string> = new Set()

      if (productIds.length) {
        const { data: variantLinks } = await query.graph({
          entity: "product_variant",
          fields: ["id", "inventory_items.id"],
          filters: { product_id: productIds },
        })

        for (const variant of variantLinks as Array<{
          inventory_items?: Array<{ id?: string }>
        }>) {
          for (const item of variant.inventory_items ?? []) {
            if (item.id) franchiseInventoryItemIds.add(item.id)
          }
        }
      }

      // Apply the tenant filter: keep only levels whose inventory_item_id is
      // in the franchise's set. Prevents cross-tenant data leakage.
      const tenantLevels = (allLevels as InventoryLevelRecord[]).filter(
        (level) => franchiseInventoryItemIds.has(level.inventory_item_id)
      )

      // Step 6 — Aggregate the per-location quantities.
      const totals = tenantLevels.reduce(
        (acc, level) => ({
          total_stocked_quantity:
            acc.total_stocked_quantity + (Number(level.stocked_quantity) || 0),
          total_reserved_quantity:
            acc.total_reserved_quantity +
            (Number(level.reserved_quantity) || 0),
          total_incoming_quantity:
            acc.total_incoming_quantity +
            (Number(level.incoming_quantity) || 0),
        }),
        {
          total_stocked_quantity: 0,
          total_reserved_quantity: 0,
          total_incoming_quantity: 0,
        }
      )

      inventoryMetrics = {
        ...totals,
        items: tenantLevels.map((level) => ({
          inventory_item_id: level.inventory_item_id,
          location_id: level.location_id,
          stocked_quantity: Number(level.stocked_quantity) || 0,
          reserved_quantity: Number(level.reserved_quantity) || 0,
          incoming_quantity: Number(level.incoming_quantity) || 0,
        })),
      }
    }
  }

  // ── Alerts ─────────────────────────────────────────────────────────────────────
  const alerts: DashboardResponse["alerts"] = []

  if (!franchise?.is_active) {
    alerts.push({
      severity: "warning",
      message: "Franchise is currently inactive.",
    })
  }

  if (!productIds.length) {
    alerts.push({
      severity: "warning",
      message: "No products linked to this franchise.",
    })
  }

  if (!storeLocationIds.length) {
    alerts.push({
      severity: "warning",
      message: "No store location linked to this franchise.",
    })
  }

  if (storeLocationIds.length && inventoryMetrics.total_stocked_quantity === 0) {
    alerts.push({
      severity: "warning",
      message:
        "No stocked inventory found for this franchise's store locations.",
    })
  }

  if (!alerts.length) {
    alerts.push({
      severity: "info",
      message: "Franchise configuration is healthy.",
    })
  }

  res.json({
    franchise,
    allowed_franchise_ids: allowedFranchiseIds,
    overview: {
      product_count: productIds.length,
      store_count: storeLocations.length,
      is_active: Boolean(franchise?.is_active),
    },
    inventory: inventoryMetrics,
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      status: product.status,
    })),
    pagination: {
      count: productIds.length,
      limit,
      offset,
    },
    stores: storeLocations.map((store: { id: string; name?: string }) => ({
      id: store.id,
      name: store.name,
    })),
    alerts,
  })
}
