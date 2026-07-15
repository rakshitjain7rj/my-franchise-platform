/**
 * product-created.ts — Workflow Hook for `createProductsWorkflow`
 *
 * Why a hook instead of a subscriber?
 * ────────────────────────────────────
 * The old subscriber (`auto-link-product-to-franchise.ts`) listened for the
 * `product.created` event, which fires **asynchronously** — AFTER the HTTP
 * response is already sent back to the Admin UI. This caused a race condition:
 *
 *   1. Admin creates product → Medusa writes to DB → returns 200.
 *   2. Admin UI immediately fires GET /admin/products/:id to show the product.
 *   3. `filterAdminProductsByFranchise` middleware checks franchise-product
 *      link table → link doesn't exist yet → throws "Product not found".
 *   4. Meanwhile, the subscriber is still processing in the background.
 *
 * A **workflow hook** runs **synchronously** within the `createProductsWorkflow`
 * transaction. The franchise-product link is created BEFORE the response is
 * sent, so the subsequent GET request always finds the link.
 *
 * Phase 2 additions (complete product provisioning)
 * ──────────────────────────────────────────────────
 * Previously, this hook ONLY created the franchise-product link. The product
 * was still invisible on the storefront because:
 *   (a) No sales channel was assigned → Medusa's channel filter hid it.
 *   (b) No inventory levels existed → cart inventory check would fail.
 *
 * Now the hook also:
 *   1. Assigns the franchise's sales channel(s) to each product.
 *   2. Creates zero-quantity inventory levels at every franchise stock location
 *      for variants that have `manage_inventory: true`.
 *
 * Result: "add a cake" is one action and it's immediately live and stockable
 * at every branch.
 *
 * Data flow
 * ─────────
 *   POST /admin/products
 *     → injectAdminFranchiseForProductCreation (middleware)
 *       → reads req.auth_context.actor_id
 *       → resolves user → franchise via franchise-user link
 *       → injects franchise_id into req.body.additional_data
 *     → createProductsWorkflow runs
 *       → productsCreated hook fires (THIS FILE)
 *         → reads additional_data.franchise_id
 *         → creates franchise-product link via remoteLink
 *         → assigns franchise sales channels to products via remoteLink
 *         → creates inventory levels at franchise stock locations
 *     → HTTP 200 returned with product data
 *     → Admin UI fires GET /admin/products/:id — link exists ✓
 *     → Product appears on storefront (sales channel assigned) ✓
 *     → Stock levels exist at all branches (inventory levels created) ✓
 */

import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import FranchiseSalesChannelLink from "../../links/franchise-sales-channel"
import StoreLocationStockLocationLink from "../../links/store-location-stock-location"

// ── Types for the compensation payload ────────────────────────────────────────

interface CompensationPayload {
  /** franchise-product link data for rollback */
  franchiseProductLinks: Array<Record<string, Record<string, string>>>
  /** product-sales-channel link data for rollback */
  salesChannelLinks: Array<Record<string, Record<string, string>>>
  /** IDs of inventory levels created, for deletion on rollback */
  inventoryLevelIds: string[]
}

createProductsWorkflow.hooks.productsCreated(
  // ── Forward handler ────────────────────────────────────────────────────────
  async ({ products, additional_data }, { container }) => {
    const logger = container.resolve("logger")
    const franchiseIds: string[] = []

    logger.info(
      `[product-created hook] ✓ HOOK FIRED — products=${products.map((p) => p.id).join(",")} ` +
        `additional_data=${JSON.stringify(additional_data)}`
    )

    // Normalise franchise_id(s) from additional_data.
    // The middleware injects either a single string or an array (for multi-
    // franchise admins).
    const raw = additional_data?.franchise_id
    if (!raw) {
      logger.info(
        "[product-created hook] No franchise_id in additional_data — " +
          "skipping auto-link (super-admin or seeding script)."
      )
      return new StepResponse(
        { franchiseProductLinks: [], salesChannelLinks: [], inventoryLevelIds: [] },
        { franchiseProductLinks: [], salesChannelLinks: [], inventoryLevelIds: [] }
      )
    }

    if (Array.isArray(raw)) {
      franchiseIds.push(...raw.filter((id: string) => Boolean(id)))
    } else if (typeof raw === "string") {
      franchiseIds.push(raw)
    }

    if (!franchiseIds.length || !products.length) {
      return new StepResponse(
        { franchiseProductLinks: [], salesChannelLinks: [], inventoryLevelIds: [] },
        { franchiseProductLinks: [], salesChannelLinks: [], inventoryLevelIds: [] }
      )
    }

    const remoteLink = container.resolve("remoteLink")
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Create franchise-product links (existing behavior)
    // ═══════════════════════════════════════════════════════════════════════
    const franchiseProductLinks: Array<Record<string, Record<string, string>>> = []

    for (const product of products) {
      for (const franchiseId of franchiseIds) {
        franchiseProductLinks.push({
          franchise: { franchise_id: franchiseId },
          [Modules.PRODUCT]: { product_id: product.id },
        })
      }
    }

    try {
      await remoteLink.create(franchiseProductLinks)
      logger.info(
        `[product-created hook] ✓ Step 1: Linked ${products.length} product(s) → ` +
          `${franchiseIds.length} franchise(s)`
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`[product-created hook] ✗ Step 1 failed (franchise links): ${message}`)
      // Re-throw so the entire workflow rolls back — if linking fails the
      // product should not be created either (transactional consistency).
      throw err
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Assign franchise's sales channel(s) to each product
    // ═══════════════════════════════════════════════════════════════════════
    const salesChannelLinks: Array<Record<string, Record<string, string>>> = []

    try {
      // Resolve the franchise's sales channel IDs
      const { data: scLinks } = await query.graph({
        entity: FranchiseSalesChannelLink.entryPoint,
        fields: ["sales_channel_id"],
        filters: { franchise_id: franchiseIds },
      })

      const salesChannelIds = Array.from(
        new Set(
          (scLinks as Array<{ sales_channel_id?: string }>)
            .map((l) => l.sales_channel_id)
            .filter((id): id is string => Boolean(id))
        )
      )

      if (!salesChannelIds.length) {
        logger.warn(
          `[product-created hook] ⚠ Step 2: No sales channels linked to franchise(s) ` +
            `${franchiseIds.join(",")} — products will not appear on storefront until ` +
            `a sales channel is manually assigned.`
        )
      } else {
        for (const product of products) {
          for (const salesChannelId of salesChannelIds) {
            salesChannelLinks.push({
              [Modules.PRODUCT]: { product_id: product.id },
              [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
            })
          }
        }

        await remoteLink.create(salesChannelLinks)
        logger.info(
          `[product-created hook] ✓ Step 2: Assigned ${salesChannelIds.length} sales channel(s) ` +
            `to ${products.length} product(s)`
        )
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`[product-created hook] ✗ Step 2 failed (sales channel links): ${message}`)
      // Roll back franchise links before re-throwing
      try {
        await remoteLink.dismiss(franchiseProductLinks)
      } catch { /* best-effort */ }
      throw err
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Create zero-quantity inventory levels at franchise stock locations
    // ═══════════════════════════════════════════════════════════════════════
    const inventoryLevelIds: string[] = []

    try {
      // 3a. Resolve franchise → store locations → stock locations
      const { data: storeLocations } = await query.graph({
        entity: "store_location",
        fields: ["id"],
        filters: { franchise_id: franchiseIds },
      })

      const storeLocationIds = (storeLocations as Array<{ id: string }>)
        .map((sl) => sl.id)
        .filter((id): id is string => Boolean(id))

      if (!storeLocationIds.length) {
        logger.info(
          `[product-created hook] Step 3: No store locations for franchise(s) — ` +
            `skipping inventory level creation. Levels will be created when stores ` +
            `are provisioned.`
        )
      } else {
        // Resolve stock location IDs via the link table
        const { data: slStockLinks } = await query.graph({
          entity: StoreLocationStockLocationLink.entryPoint,
          fields: ["stock_location_id"],
          filters: { store_location_id: storeLocationIds },
        })

        const stockLocationIds = Array.from(
          new Set(
            (slStockLinks as Array<{ stock_location_id?: string }>)
              .map((l) => l.stock_location_id)
              .filter((id): id is string => Boolean(id))
          )
        )

        if (!stockLocationIds.length) {
          logger.warn(
            `[product-created hook] ⚠ Step 3: Store locations exist but none have ` +
              `linked stock locations. Run the store health check to fix wiring.`
          )
        } else {
          // 3b. Resolve inventory item IDs for the newly created product variants.
          //     Medusa auto-creates inventory items for variants with
          //     `manage_inventory: true` inside createProductsWorkflow — we just
          //     need to query them.
          const productIds = products.map((p) => p.id)

          const { data: variantData } = await query.graph({
            entity: "product_variant",
            fields: ["id", "manage_inventory", "inventory_items.id"],
            filters: { product_id: productIds },
          })

          type VariantWithInventory = {
            id: string
            manage_inventory?: boolean
            inventory_items?: Array<{ id?: string }>
          }

          const inventoryItemIdSet = new Set<string>()
          for (const variant of variantData as VariantWithInventory[]) {
            // Only create levels for variants that manage inventory
            if (variant.manage_inventory === false) continue
            for (const item of variant.inventory_items ?? []) {
              if (item.id) inventoryItemIdSet.add(item.id)
            }
          }
          const inventoryItemIds = Array.from(inventoryItemIdSet)

          if (!inventoryItemIds.length) {
            logger.info(
              `[product-created hook] Step 3: No managed-inventory variants found — ` +
                `skipping inventory level creation.`
            )
          } else {
            // 3c. Check for existing levels to avoid duplicates
            const inventoryService = container.resolve(Modules.INVENTORY) as any

            // Build the cartesian product: every inventory item × every stock location
            const levelsToCreate: Array<{
              inventory_item_id: string
              location_id: string
              stocked_quantity: number
            }> = []

            for (const inventoryItemId of inventoryItemIds) {
              for (const stockLocationId of stockLocationIds) {
                // Check if level already exists (idempotency guard)
                const existing = await inventoryService.listInventoryLevels({
                  inventory_item_id: inventoryItemId,
                  location_id: stockLocationId,
                })

                if (!existing.length) {
                  levelsToCreate.push({
                    inventory_item_id: inventoryItemId,
                    location_id: stockLocationId,
                    stocked_quantity: 0,
                  })
                }
              }
            }

            if (levelsToCreate.length) {
              // Use the inventory service directly — the workflow runs inside the
              // createProductsWorkflow transaction already, and calling
              // createInventoryLevelsWorkflow from inside a hook can cause nesting
              // issues. The direct service call is safe here.
              const createdLevels = await inventoryService.createInventoryLevels(
                levelsToCreate
              )

              for (const level of createdLevels) {
                inventoryLevelIds.push(level.id)
              }

              logger.info(
                `[product-created hook] ✓ Step 3: Created ${createdLevels.length} inventory ` +
                  `level(s) across ${stockLocationIds.length} stock location(s) for ` +
                  `${inventoryItemIds.length} inventory item(s) — all at qty 0`
              )
            } else {
              logger.info(
                `[product-created hook] Step 3: All inventory levels already exist — no-op.`
              )
            }
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(
        `[product-created hook] ✗ Step 3 failed (inventory levels): ${message}`
      )
      // Roll back steps 1 and 2 before re-throwing
      try {
        if (salesChannelLinks.length) await remoteLink.dismiss(salesChannelLinks)
        await remoteLink.dismiss(franchiseProductLinks)
      } catch { /* best-effort */ }
      // Clean up any levels we partially created
      if (inventoryLevelIds.length) {
        try {
          const inventoryService = container.resolve(Modules.INVENTORY) as any
          await inventoryService.deleteInventoryLevels(inventoryLevelIds)
        } catch { /* best-effort */ }
      }
      throw err
    }

    const compensation: CompensationPayload = {
      franchiseProductLinks,
      salesChannelLinks,
      inventoryLevelIds,
    }

    return new StepResponse(compensation, compensation)
  },

  // ── Compensation handler (rollback) ────────────────────────────────────────
  // If a later step in the workflow fails, Medusa invokes this to undo our
  // side-effects. We dismiss the links and delete inventory levels we created.
  async (compensationData, { container }) => {
    if (!compensationData) return

    const {
      franchiseProductLinks,
      salesChannelLinks,
      inventoryLevelIds,
    } = compensationData as CompensationPayload

    const remoteLink = container.resolve("remoteLink")
    const logger = container.resolve("logger")

    // Roll back inventory levels (Step 3)
    if (inventoryLevelIds.length) {
      try {
        const inventoryService = container.resolve(Modules.INVENTORY) as any
        await inventoryService.deleteInventoryLevels(inventoryLevelIds)
        logger.info(
          `[product-created hook] ↺ Rolled back ${inventoryLevelIds.length} inventory level(s)`
        )
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(
          `[product-created hook] ↺ Failed to roll back inventory levels: ${message}`
        )
      }
    }

    // Roll back sales channel links (Step 2)
    if (salesChannelLinks.length) {
      try {
        await remoteLink.dismiss(salesChannelLinks)
        logger.info(
          `[product-created hook] ↺ Rolled back ${salesChannelLinks.length} sales channel link(s)`
        )
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(
          `[product-created hook] ↺ Failed to roll back sales channel links: ${message}`
        )
      }
    }

    // Roll back franchise-product links (Step 1)
    if (franchiseProductLinks.length) {
      try {
        await remoteLink.dismiss(franchiseProductLinks)
        logger.info(
          `[product-created hook] ↺ Rolled back ${franchiseProductLinks.length} franchise-product link(s)`
        )
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(
          `[product-created hook] ↺ Failed to roll back franchise-product links: ${message}`
        )
      }
    }
  }
)
