/**
 * deleteStoreLocationWorkflow
 *
 * Safe, idempotent workflow that tears down a store location and all its
 * Medusa plumbing:
 *
 *   1. Resolve all linked entities (stock location, products, users)
 *   2. Dismiss all link-table rows (store↔stock, store↔product, user↔store)
 *   3. Delete the shadow StockLocation (via Medusa core workflow)
 *   4. Delete the StoreLocation row (custom franchise module)
 *
 * Designed to be idempotent — calling it on a partially-deleted location
 * completes the cleanup without errors.
 */

import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { deleteStockLocationsWorkflow } from "@medusajs/medusa/core-flows"
import StoreLocationStockLocationLink from "../links/store-location-stock-location"
import StoreLocationProductLink from "../links/store-location-product"
import StoreLocationUserLink from "../links/store-location-user"

// ─── Input / Output Types ───────────────────────────────────────────────────

export interface DeleteStoreLocationWorkflowInput {
  store_location_id: string
}

interface ResolvedEntities {
  store_location_id: string
  stock_location_id: string | null
  product_link_count: number
  user_link_count: number
}

// ─── Step 1: Resolve linked entities ────────────────────────────────────────

const resolveLinkedEntitiesStep = createStep(
  "resolve-linked-entities-step",
  async (
    input: DeleteStoreLocationWorkflowInput,
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve("logger")

    // Find linked stock location
    const { data: stockLinks } = await query.graph({
      entity: StoreLocationStockLocationLink.entryPoint,
      fields: ["stock_location_id"],
      filters: { store_location_id: input.store_location_id },
    })

    const stockLocationId =
      (stockLinks as Array<{ stock_location_id?: string }>)[0]
        ?.stock_location_id ?? null

    // Count product links
    const { data: productLinks } = await query.graph({
      entity: StoreLocationProductLink.entryPoint,
      fields: ["product_id"],
      filters: { store_location_id: input.store_location_id },
    })

    // Count user links
    const { data: userLinks } = await query.graph({
      entity: StoreLocationUserLink.entryPoint,
      fields: ["user_id"],
      filters: { store_location_id: input.store_location_id },
    })

    const resolved: ResolvedEntities = {
      store_location_id: input.store_location_id,
      stock_location_id: stockLocationId,
      product_link_count: productLinks.length,
      user_link_count: userLinks.length,
    }

    logger.info(
      `[delete-store-location] ✓ Step 1: Resolved entities for ${input.store_location_id}: ` +
        `stock_location=${stockLocationId ?? "none"}, ` +
        `product_links=${productLinks.length}, ` +
        `user_links=${userLinks.length}`
    )

    return new StepResponse(resolved)
  }
)

// ─── Step 2: Dismiss all links ──────────────────────────────────────────────

const dismissAllLinksStep = createStep(
  "dismiss-all-links-step",
  async (input: ResolvedEntities, { container }) => {
    const remoteLink = container.resolve<any>(
      ContainerRegistrationKeys.REMOTE_LINK
    )
    const logger = container.resolve("logger")

    // Dismiss store_location ↔ stock_location link
    if (input.stock_location_id) {
      try {
        await remoteLink.dismiss({
          franchise: {
            store_location_id: input.store_location_id,
          },
          [Modules.STOCK_LOCATION]: {
            stock_location_id: input.stock_location_id,
          },
        })
        logger.info(
          `[delete-store-location]   ↳ Dismissed store↔stock link`
        )
      } catch (err) {
        logger.warn(
          `[delete-store-location]   ↳ Could not dismiss store↔stock link (may already be gone): ${err}`
        )
      }
    }

    // Dismiss all store_location ↔ product links
    if (input.product_link_count > 0) {
      try {
        // Dismiss by the store_location side — removes all product rows for this store
        await remoteLink.dismiss({
          franchise: {
            store_location_id: input.store_location_id,
          },
        })
        logger.info(
          `[delete-store-location]   ↳ Dismissed ${input.product_link_count} store↔product link(s)`
        )
      } catch (err) {
        logger.warn(
          `[delete-store-location]   ↳ Could not dismiss store↔product links: ${err}`
        )
      }
    }

    // Dismiss all user ↔ store_location links
    if (input.user_link_count > 0) {
      try {
        // The user-store link table key is user_store_location with store_location_id
        // We need to dismiss from the store_location side
        await remoteLink.dismiss({
          franchise: {
            store_location_id: input.store_location_id,
          },
        })
        logger.info(
          `[delete-store-location]   ↳ Dismissed ${input.user_link_count} user↔store link(s)`
        )
      } catch (err) {
        logger.warn(
          `[delete-store-location]   ↳ Could not dismiss user↔store links: ${err}`
        )
      }
    }

    logger.info(
      `[delete-store-location] ✓ Step 2: All links dismissed for ${input.store_location_id}`
    )

    return new StepResponse(true)
  }
)

// ─── Step 3: Delete the shadow StockLocation ────────────────────────────────

const deleteShadowStockLocationStep = createStep(
  "delete-shadow-stock-location-step",
  async (
    input: { stock_location_id: string | null },
    { container }
  ) => {
    const logger = container.resolve("logger")

    if (!input.stock_location_id) {
      logger.info(
        `[delete-store-location] ✓ Step 3: No linked StockLocation to delete — skipping`
      )
      return new StepResponse(false)
    }

    try {
      await deleteStockLocationsWorkflow(container).run({
        input: { ids: [input.stock_location_id] },
      })

      logger.info(
        `[delete-store-location] ✓ Step 3: Deleted StockLocation ${input.stock_location_id}`
      )
    } catch (err) {
      // Idempotent: if already deleted, don't fail
      logger.warn(
        `[delete-store-location]   ↳ Could not delete StockLocation ${input.stock_location_id} (may already be gone): ${err}`
      )
    }

    return new StepResponse(true)
  }
)

// ─── Step 4: Delete the StoreLocation ───────────────────────────────────────

const deleteStoreLocationStep = createStep(
  "delete-store-location-step",
  async (
    input: { store_location_id: string },
    { container }
  ) => {
    const franchiseService = container.resolve<any>("franchise")
    const logger = container.resolve("logger")

    await franchiseService.deleteStoreLocations([input.store_location_id])

    logger.info(
      `[delete-store-location] ✓ Step 4: Deleted StoreLocation ${input.store_location_id}`
    )

    return new StepResponse(true)
  }
)

// ─── Workflow ───────────────────────────────────────────────────────────────

export const deleteStoreLocationWorkflowId = "delete-store-location-workflow"

export const deleteStoreLocationWorkflow = createWorkflow(
  deleteStoreLocationWorkflowId,
  (input: DeleteStoreLocationWorkflowInput) => {
    // Step 1: Find everything linked to this store location
    const resolved = resolveLinkedEntitiesStep(input)

    // Step 2: Dismiss all link-table rows
    dismissAllLinksStep(resolved)

    // Step 3: Delete the shadow StockLocation
    deleteShadowStockLocationStep({
      stock_location_id: resolved.stock_location_id,
    })

    // Step 4: Delete the StoreLocation itself
    deleteStoreLocationStep({
      store_location_id: input.store_location_id,
    })

    return new WorkflowResponse({ success: true })
  }
)
