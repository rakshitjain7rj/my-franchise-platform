/**
 * @file /admin/products/:id/store-availability
 * @description Manage per-store availability overrides for a product.
 *
 * Protected by the `/admin/products/:id/*` middleware chain (authenticate +
 * guardAdminProductMutation), so only an admin who owns the product's franchise
 * can reach these handlers.
 *
 * Availability contract (see src/links/store-location-product.ts):
 *   - Empty override set  → product is SHARED across every store in its
 *                           franchise (the default).
 *   - Non-empty set       → product is RESTRICTED to exactly those stores.
 *
 * GET  → returns the current override store_location_ids (empty = shared/all).
 * POST → replaces the override set. Body: { store_location_ids: string[] }.
 *        Every id must belong to the product's franchise; an empty array clears
 *        the override (makes the product shared again).
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import FranchiseProductLink from "../../../../../links/franchise-product"
import StoreLocationProductLink from "../../../../../links/store-location-product"

type QueryGraph = {
  graph: (opts: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => Promise<{ data: Array<Record<string, any>> }>
}

/** Resolve the franchise that owns a product (one-to-many franchise-product). */
async function resolveProductFranchiseId(
  query: QueryGraph,
  productId: string
): Promise<string | undefined> {
  const { data } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["franchise_id"],
    filters: { product_id: productId },
  })
  return data?.[0]?.franchise_id as string | undefined
}

/** Current override store_location_ids for a product. */
async function loadOverrideStoreIds(
  query: QueryGraph,
  productId: string
): Promise<string[]> {
  const { data } = await query.graph({
    entity: StoreLocationProductLink.entryPoint,
    fields: ["store_location_id"],
    filters: { product_id: productId },
  })
  return Array.from(
    new Set(
      data
        .map((r) => r.store_location_id as string | undefined)
        .filter((id): id is string => Boolean(id))
    )
  )
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as QueryGraph

  const storeLocationIds = await loadOverrideStoreIds(query, productId)

  res.json({
    product_id: productId,
    // Empty means shared across all stores in the franchise.
    shared_across_all_stores: storeLocationIds.length === 0,
    store_location_ids: storeLocationIds,
  })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as QueryGraph
  const remoteLink = req.scope.resolve("remoteLink")

  const body = (req.validatedBody ?? req.body) as {
    store_location_ids?: unknown
  }
  const rawIds = body?.store_location_ids

  if (rawIds !== undefined && !Array.isArray(rawIds)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "`store_location_ids` must be an array of store location IDs."
    )
  }

  const requestedIds = Array.from(
    new Set(
      (Array.isArray(rawIds) ? rawIds : [])
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  )

  // Tenant validation: every requested store must belong to the product's
  // franchise. This blocks making a product "available" at another franchise's
  // branch.
  const franchiseId = await resolveProductFranchiseId(query, productId)
  if (requestedIds.length) {
    if (!franchiseId) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Product has no franchise; cannot assign store availability."
      )
    }

    const { data: stores } = await query.graph({
      entity: "store_location",
      fields: ["id"],
      filters: { id: requestedIds, franchise_id: franchiseId },
    })
    const validIds = new Set(stores.map((s) => s.id as string))
    const invalid = requestedIds.filter((id) => !validIds.has(id))
    if (invalid.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Store location(s) not in this product's franchise: ${invalid.join(", ")}`
      )
    }
  }

  // Reconcile: dismiss removed links, create added links. Idempotent.
  const currentIds = await loadOverrideStoreIds(query, productId)
  const toAdd = requestedIds.filter((id) => !currentIds.includes(id))
  const toRemove = currentIds.filter((id) => !requestedIds.includes(id))

  if (toAdd.length) {
    await remoteLink.create(
      toAdd.map((storeLocationId) => ({
        franchise: { store_location_id: storeLocationId },
        [Modules.PRODUCT]: { product_id: productId },
      }))
    )
  }
  if (toRemove.length) {
    await remoteLink.dismiss(
      toRemove.map((storeLocationId) => ({
        franchise: { store_location_id: storeLocationId },
        [Modules.PRODUCT]: { product_id: productId },
      }))
    )
  }

  res.json({
    product_id: productId,
    shared_across_all_stores: requestedIds.length === 0,
    store_location_ids: requestedIds,
  })
}
