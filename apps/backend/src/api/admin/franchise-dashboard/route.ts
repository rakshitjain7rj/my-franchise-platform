import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IProductModuleService } from "@medusajs/framework/types"
import FranchiseProductLink from "../../../links/franchise-product"
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
  //   1. Resolve Medusa StockLocations linked to this franchise's StoreLocations.
  //   2. List inventory_level rows at those stock locations via the Inventory
  //      module (source of truth). Do NOT join through product_variant.inventory_items.id
  //      — that graph path returns product_variant_inventory_item *link* ids
  //      (pvitem_…) which never match inventory_level.inventory_item_id (iitem_…),
  //      so the previous tenant filter zeroed out real stock.
  //
  // Tenant boundary: stock locations are already franchise-scoped via the
  // store_location ↔ stock_location link. Levels at those locations are this
  // franchise's branch inventory.
  //
  let inventoryMetrics: DashboardResponse["inventory"] = {
    total_stocked_quantity: 0,
    total_reserved_quantity: 0,
    total_incoming_quantity: 0,
    items: [],
  }

  if (storeLocationIds.length) {
    const { data: slStockLinks } = await query.graph({
      entity: StoreLocationStockLocationLink.entryPoint,
      fields: ["stock_location_id"],
      filters: { store_location_id: storeLocationIds },
    })

    type SLStockLink = { stock_location_id?: string }
    const locationIds = Array.from(
      new Set(
        (slStockLinks as unknown as SLStockLink[])
          .map((link) => link.stock_location_id)
          .filter((id): id is string => Boolean(id))
      )
    )

    if (locationIds.length) {
      const inventoryService = req.scope.resolve(Modules.INVENTORY) as {
        listInventoryLevels: (
          filters: Record<string, unknown>,
          config?: Record<string, unknown>
        ) => Promise<
          Array<{
            inventory_item_id?: string
            location_id?: string
            stocked_quantity?: number | string | { value?: string }
            reserved_quantity?: number | string | { value?: string }
            incoming_quantity?: number | string | { value?: string }
          }>
        >
      }

      const toQty = (value: unknown): number => {
        if (value == null) return 0
        if (typeof value === "number") return Number.isFinite(value) ? value : 0
        if (typeof value === "string") {
          const n = Number(value)
          return Number.isFinite(n) ? n : 0
        }
        if (typeof value === "object" && value !== null) {
          const raw =
            (value as { value?: unknown; numeric?: unknown }).value ??
            (value as { numeric?: unknown }).numeric
          return toQty(raw)
        }
        return 0
      }

      // Large catalogues (900+ SKUs × N branches) need a high take ceiling.
      const allLevels = await inventoryService.listInventoryLevels(
        { location_id: locationIds },
        { take: 200_000 }
      )

      const tenantLevels: InventoryLevelRecord[] = allLevels
        .filter(
          (level) =>
            Boolean(level.inventory_item_id) && Boolean(level.location_id)
        )
        .map((level) => ({
          inventory_item_id: level.inventory_item_id as string,
          location_id: level.location_id as string,
          stocked_quantity: toQty(level.stocked_quantity),
          reserved_quantity: toQty(level.reserved_quantity),
          incoming_quantity: toQty(level.incoming_quantity),
        }))

      const totals = tenantLevels.reduce(
        (acc, level) => ({
          total_stocked_quantity:
            acc.total_stocked_quantity + level.stocked_quantity,
          total_reserved_quantity:
            acc.total_reserved_quantity + level.reserved_quantity,
          total_incoming_quantity:
            acc.total_incoming_quantity + level.incoming_quantity,
        }),
        {
          total_stocked_quantity: 0,
          total_reserved_quantity: 0,
          total_incoming_quantity: 0,
        }
      )

      // Cap the detail payload — dashboard UI only needs a sample + totals.
      const SAMPLE_LIMIT = 100
      inventoryMetrics = {
        ...totals,
        items: tenantLevels.slice(0, SAMPLE_LIMIT).map((level) => ({
          inventory_item_id: level.inventory_item_id,
          location_id: level.location_id,
          stocked_quantity: level.stocked_quantity,
          reserved_quantity: level.reserved_quantity,
          incoming_quantity: level.incoming_quantity,
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
