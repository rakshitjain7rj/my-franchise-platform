import type {
  AuthenticatedMedusaRequest,
  MedusaRequest,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import FranchiseUserLink from "../links/franchise-user"
import FranchiseSalesChannelLink from "../links/franchise-sales-channel"
import FranchiseProductLink from "../links/franchise-product"
import StoreLocationStockLocationLink from "../links/store-location-stock-location"
import StoreLocationUserLink from "../links/store-location-user"
import OrderStoreLocationLink from "../links/order-store-location"

declare module "@medusajs/framework/http" {
  interface MedusaRequest {
    franchise_id?: string
    pricing_context?: Record<string, unknown>
    is_super_admin?: boolean
    allowed_franchise_ids?: string[]
    allowed_store_location_ids?: string[] | null
  }
}

export interface TenantRequest extends MedusaRequest {
  franchise_id?: string
  is_super_admin?: boolean
  allowed_franchise_ids?: string[]
  allowed_store_location_ids?: string[] | null
}

export interface AuthenticatedTenantRequest extends AuthenticatedMedusaRequest {
  franchise_id?: string
  is_super_admin?: boolean
  allowed_franchise_ids?: string[]
  allowed_store_location_ids?: string[] | null
}

const TENANT_ERROR_MESSAGE = "Missing franchise context"
const FORBIDDEN_FRANCHISE_CONTEXT = "Unauthorized franchise context"
const MISSING_ADMIN_AUTH = "Missing admin authentication context"

export const getTenantContext = (req: TenantRequest): string | undefined => {
  const franchiseId = req.franchise_id ||
    (req.headers?.["x-franchise-id"] as string) ||
    (req.query?.franchise_id as string)
  return typeof franchiseId === "string" ? franchiseId.trim() : undefined
}

export const buildTenantFilter = (req: TenantRequest): { franchise_id: string } => {
  const franchiseId = getTenantContext(req)

  if (!franchiseId) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, TENANT_ERROR_MESSAGE)
  }

  return { franchise_id: franchiseId }
}

const extractAdminFranchiseIds = async (
  req: AuthenticatedTenantRequest
): Promise<string[]> => {
  if (req.allowed_franchise_ids !== undefined) {
    return req.allowed_franchise_ids
  }
  const actorId = req.auth_context?.actor_id

  if (!actorId) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, MISSING_ADMIN_AUTH)
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: FranchiseUserLink.entryPoint,
    fields: ["franchise_id"],
    filters: {
      user_id: actorId,
    },
  })

  const ids = Array.from(
    new Set(
      data
        .map((record: { franchise_id?: string }) => record.franchise_id)
        .filter((franchiseId): franchiseId is string => Boolean(franchiseId))
    )
  )
  req.allowed_franchise_ids = ids
  return ids
}

/**
 * List every franchise ID (for super-admin fallback when they have no
 * franchise-user links). Super-admin identity is the positive
 * `metadata.is_super_admin` flag — never inferred from an empty link set.
 */
const listAllFranchiseIds = async (
  req: AuthenticatedTenantRequest
): Promise<string[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "franchise",
    fields: ["id"],
  })
  return Array.from(
    new Set(
      (data as Array<{ id?: string }>)
        .map((row) => row.id)
        .filter((id): id is string => Boolean(id))
    )
  )
}

export const resolveAdminFranchiseIds = async (
  req: AuthenticatedTenantRequest
): Promise<string[]> => {
  const franchiseIds = await extractAdminFranchiseIds(req)

  if (franchiseIds.length) {
    return franchiseIds
  }

  // No franchise-user links: only confirmed super-admins may proceed, and they
  // get every franchise so dashboard / location routes can resolve a context.
  // Unlinked, unflagged admins stay fail-closed ("Missing franchise context").
  const isSA = await isSuperAdminUser(req)
  if (!isSA) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, TENANT_ERROR_MESSAGE)
  }

  const allIds = await listAllFranchiseIds(req)
  if (!allIds.length) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, TENANT_ERROR_MESSAGE)
  }

  req.allowed_franchise_ids = allIds
  return allIds
}

export const resolveAdminFranchiseContext = async (
  req: AuthenticatedTenantRequest
): Promise<string> => {
  const allowedFranchiseIds = await resolveAdminFranchiseIds(req)
  const requestedFranchiseId = getTenantContext(req)

  if (!requestedFranchiseId) {
    return allowedFranchiseIds[0]
  }

  if (!allowedFranchiseIds.includes(requestedFranchiseId)) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      FORBIDDEN_FRANCHISE_CONTEXT
    )
  }

  return requestedFranchiseId
}

// Example: use in a custom route handler
//
// import type { MedusaResponse } from "@medusajs/framework/http"
// import type { TenantRequest } from "../../utils/tenant-context"
// import { buildTenantFilter } from "../../utils/tenant-context"
//
// export const GET = async (req: TenantRequest, res: MedusaResponse) => {
//   const franchiseFilter = buildTenantFilter(req)
//   const franchiseService = req.scope.resolve("franchise")
//
//   const [records] = await franchiseService.listAndCount(franchiseFilter)
//   res.json({ records })
// }

export const isSuperAdminUser = async (
  req: any
): Promise<boolean> => {
  if (req.is_super_admin !== undefined) {
    return req.is_super_admin
  }
  const actorId = req.auth_context?.actor_id
  if (!actorId) return false

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  try {
    const { data: users } = await query.graph({
      entity: "user",
      fields: ["id", "metadata"],
      filters: { id: actorId },
    })

    if (!users.length) {
      req.is_super_admin = false
      return false
    }

    const metadata = (users[0].metadata as Record<string, unknown> | null) ?? {}
    const isSuper = metadata.is_super_admin === true
    req.is_super_admin = isSuper
    return isSuper
  } catch (err) {
    // Fail closed: a transient failure downgrades the caller to non-super-admin
    // rather than granting global access. Log through the container's logger so
    // the downgrade is visible in production log aggregation (console.error only
    // reaches stdout); fall back to console if the logger cannot be resolved.
    try {
      const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
      logger.error(
        `[isSuperAdminUser] Error checking user metadata for actor_id=${actorId}; ` +
          `treating as non-super-admin (fail closed): ${
            err instanceof Error ? err.message : String(err)
          }`
      )
    } catch {
      console.error("[isSuperAdminUser] Error checking user metadata:", err)
    }
    return false
  }
}

export const getStockLocationIdsForFranchises = async (
  req: MedusaRequest,
  franchiseIds: string[]
): Promise<string[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // 1. Resolve store locations for franchises
  const { data: storeLocations } = await query.graph({
    entity: "store_location",
    fields: ["id"],
    filters: { franchise_id: franchiseIds },
  })

  const storeLocationIds = storeLocations
    .map((sl: any) => sl.id)
    .filter((id): id is string => Boolean(id))

  if (!storeLocationIds.length) {
    return []
  }

  // 2. Query stock location IDs from link table
  const { data: slStockLinks } = await query.graph({
    entity: StoreLocationStockLocationLink.entryPoint,
    fields: ["stock_location_id"],
    filters: { store_location_id: storeLocationIds },
  })

  type SLStockLink = { stock_location_id?: string }
  return Array.from(
    new Set(
      (slStockLinks as unknown as SLStockLink[])
        .map((link) => link.stock_location_id)
        .filter((id): id is string => Boolean(id))
    )
  )
}

/**
 * Resolve every SalesChannel ID linked to the given franchise IDs.
 * Chain: Franchise → SalesChannel (via franchise-sales-channel link)
 */
export const getSalesChannelIdsForFranchises = async (
  req: MedusaRequest,
  franchiseIds: string[]
): Promise<string[]> => {
  if (!franchiseIds.length) return []

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: links } = await query.graph({
    entity: FranchiseSalesChannelLink.entryPoint,
    fields: ["sales_channel_id"],
    filters: { franchise_id: franchiseIds },
  })

  return Array.from(
    new Set(
      (links as Array<{ sales_channel_id?: string }>)
        .map((l) => l.sales_channel_id)
        .filter((id): id is string => Boolean(id))
    )
  )
}

/**
 * Resolve every InventoryItem ID linked to the franchise's products.
 * Chain: Franchise → Products → ProductVariants → InventoryItems
 */
export const getInventoryItemIdsForFranchises = async (
  req: MedusaRequest,
  franchiseIds: string[]
): Promise<string[]> => {
  if (!franchiseIds.length) return []

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Step 1 — franchise → product IDs via franchise_product link table
  const { data: productLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: { franchise_id: franchiseIds },
  })

  const productIds = Array.from(
    new Set(
      (productLinks as Array<{ product_id?: string }>)
        .map((l) => l.product_id)
        .filter((id): id is string => Boolean(id))
    )
  )

  if (!productIds.length) return []

  // Step 2 — product → variant → inventory item IDs
  const { data: variantLinks } = await query.graph({
    entity: "product_variant",
    fields: ["id", "inventory_items.id"],
    filters: { product_id: productIds },
  })

  const inventoryItemIds = new Set<string>()
  for (const variant of variantLinks as Array<{ inventory_items?: Array<{ id?: string }> }>) {
    for (const item of variant.inventory_items ?? []) {
      if (item.id) inventoryItemIds.add(item.id)
    }
  }

  return Array.from(inventoryItemIds)
}

// ───────────────────────────────────────────────────────────────────────────
// STORE-LEVEL (Tier 2) SCOPING — branch-manager isolation inside a franchise
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resolve the StoreLocation IDs an authenticated admin is restricted to.
 *
 * Semantics (see src/links/store-location-user.ts for the contract):
 *   - Returns `null`  → the user has NO store-location link, so NO additional
 *                       store restriction applies. They remain franchise-wide
 *                       (super admins and un-scoped franchise admins alike).
 *                       The franchise-level middleware still applies its own
 *                       boundary; this layer simply adds nothing.
 *   - Returns `[]`    → the user IS store-scoped but their link resolved to no
 *                       usable IDs (data anomaly). Callers MUST fail closed and
 *                       return an empty result set rather than leak franchise
 *                       data.
 *   - Returns `[...]` → the explicit set of StoreLocation IDs the user may see.
 *
 * This helper never throws for a missing franchise membership — store scoping is
 * orthogonal to franchise membership and is resolved purely from the
 * store-location-user link. Unexpected infrastructure errors DO propagate so the
 * caller can fail closed (consistent with commit 16e27fb).
 */
export const resolveAllowedStoreLocationIds = async (
  req: AuthenticatedTenantRequest
): Promise<string[] | null> => {
  if (req.allowed_store_location_ids !== undefined) {
    return req.allowed_store_location_ids
  }
  const actorId = req.auth_context?.actor_id
  if (!actorId) {
    return null
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: links } = await query.graph({
    entity: StoreLocationUserLink.entryPoint,
    fields: ["store_location_id"],
    filters: { user_id: actorId },
  })

  // No link rows → franchise-wide user, add no store restriction.
  if (!links.length) {
    req.allowed_store_location_ids = null
    return null
  }

  const ids = Array.from(
    new Set(
      (links as Array<{ store_location_id?: string }>)
        .map((l) => l.store_location_id)
        .filter((id): id is string => Boolean(id))
    )
  )
  req.allowed_store_location_ids = ids
  return ids
}

/**
 * Resolve every Order ID linked to the given StoreLocation IDs via the
 * `store_location ←→ order` link table. Used to inject an `id` allow-list into
 * the admin order list/detail filters for store-scoped managers.
 */
export const getOrderIdsForStoreLocations = async (
  req: MedusaRequest,
  storeLocationIds: string[]
): Promise<string[]> => {
  if (!storeLocationIds.length) return []

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: links } = await query.graph({
    entity: OrderStoreLocationLink.entryPoint,
    fields: ["order_id"],
    filters: { store_location_id: storeLocationIds },
  })

  return Array.from(
    new Set(
      (links as Array<{ order_id?: string }>)
        .map((l) => l.order_id)
        .filter((id): id is string => Boolean(id))
    )
  )
}

/**
 * Resolve every StockLocation ID linked to the given StoreLocation IDs via the
 * `store_location ←→ stock_location` link table. Used to narrow inventory and
 * reservation scoping from "all franchise stores" down to a manager's branches.
 */
export const getStockLocationIdsForStoreLocations = async (
  req: MedusaRequest,
  storeLocationIds: string[]
): Promise<string[]> => {
  if (!storeLocationIds.length) return []

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: links } = await query.graph({
    entity: StoreLocationStockLocationLink.entryPoint,
    fields: ["stock_location_id"],
    filters: { store_location_id: storeLocationIds },
  })

  return Array.from(
    new Set(
      (links as Array<{ stock_location_id?: string }>)
        .map((l) => l.stock_location_id)
        .filter((id): id is string => Boolean(id))
    )
  )
}
