/**
 * fix-live-franchise-gaps.ts
 *
 * Closes the remaining data gaps that keep products invisible on the
 * storefront even after `relink-products-to-live-franchise.ts`:
 *
 *   1. Sales channel — every non-deleted product gets a link to the
 *      publishable key's sales channel (the store API filters by it, so a
 *      product without this link never appears regardless of franchise links).
 *   2. Draft products — published, so the store API returns them.
 *   3. StoreLocation ↔ StockLocation — links the live store location to the
 *      stock location so per-branch inventory checks can resolve.
 *   4. Franchise admin user — re-points a user whose franchise link targets a
 *      deleted franchise at the live franchise (dismiss + create), so products
 *      they create auto-link correctly.
 *
 * Idempotent: safe to re-run; every step checks current state first.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/fix-live-franchise-gaps.ts
 *
 * Env overrides:
 *   FRANCHISE_ID       (default: fran_01KWKB6ET5SHWPTRP07DN0QPQS)
 *   SALES_CHANNEL_ID   (default: resolved from "Default Sales Channel")
 *   STORE_LOCATION_ID  (default: first store location of the franchise)
 *   STOCK_LOCATION_ID  (default: first non-deleted stock location)
 *   TARGET_EMAIL       (default: sirhind@cakery.com)
 *   SKIP_PUBLISH=1     (leave draft products untouched)
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import FranchiseUserLink from "../../links/franchise-user"
import StoreLocationStockLocationLink from "../../links/store-location-stock-location"

export default async function fixLiveFranchiseGaps({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const productService = container.resolve(Modules.PRODUCT)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)
  const userService = container.resolve(Modules.USER)
  const franchiseService = container.resolve("franchise") as {
    listStoreLocations: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ id: string; name: string }>>
  }

  const franchiseId =
    process.env.FRANCHISE_ID ?? "fran_01KWKB6ET5SHWPTRP07DN0QPQS"
  const targetEmail = process.env.TARGET_EMAIL ?? "sirhind@cakery.com"

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Fix Live Franchise Gaps")
  logger.info(`  Franchise: ${franchiseId}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // ── 0. Verify franchise exists ─────────────────────────────────────────────
  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id", "name"],
    filters: { id: franchiseId },
  })
  if (!franchises.length) {
    throw new Error(`Franchise not found: ${franchiseId}`)
  }
  logger.info(`✓ Franchise: ${(franchises[0] as { name: string }).name}`)

  // ── 1. Sales channel links ─────────────────────────────────────────────────
  let salesChannelId = process.env.SALES_CHANNEL_ID
  if (!salesChannelId) {
    const channels = await salesChannelService.listSalesChannels({
      name: "Default Sales Channel",
    })
    salesChannelId = channels[0]?.id
  }
  if (!salesChannelId) {
    throw new Error(
      "No sales channel resolved — set SALES_CHANNEL_ID explicitly."
    )
  }
  logger.info(`\n[1/4] Ensuring products are on sales channel ${salesChannelId}`)

  const { data: allProducts } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "sales_channels.id"],
  })

  let channelLinksAdded = 0
  for (const product of allProducts as Array<{
    id: string
    title: string
    sales_channels?: Array<{ id: string } | null>
  }>) {
    const channelIds = (product.sales_channels ?? [])
      .filter((sc): sc is { id: string } => Boolean(sc))
      .map((sc) => sc.id)
    if (channelIds.includes(salesChannelId)) continue

    await remoteLink.create({
      [Modules.PRODUCT]: { product_id: product.id },
      [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
    })
    logger.info(`  ✅ Added to sales channel: ${product.title}`)
    channelLinksAdded++
  }
  logger.info(`  → ${channelLinksAdded} product(s) added to the sales channel`)

  // ── 2. Publish drafts ──────────────────────────────────────────────────────
  logger.info(`\n[2/4] Publishing draft products`)
  if (process.env.SKIP_PUBLISH === "1") {
    logger.info("  → Skipped (SKIP_PUBLISH=1)")
  } else {
    const drafts = await productService.listProducts(
      { status: [ProductStatus.DRAFT] },
      { select: ["id", "title"] }
    )
    for (const draft of drafts) {
      await productService.updateProducts(draft.id, {
        status: ProductStatus.PUBLISHED,
      })
      logger.info(`  ✅ Published: ${draft.title}`)
    }
    logger.info(`  → ${drafts.length} draft(s) published`)
  }

  // ── 3. StoreLocation ↔ StockLocation link ──────────────────────────────────
  logger.info(`\n[3/4] Linking store location to stock location`)

  let storeLocationId = process.env.STORE_LOCATION_ID
  if (!storeLocationId) {
    const locations = await franchiseService.listStoreLocations(
      { franchise_id: franchiseId },
      { select: ["id", "name"] }
    )
    storeLocationId = locations[0]?.id
  }
  if (!storeLocationId) {
    logger.warn("  ⚠ No store location found for this franchise — skipping.")
  } else {
    const { data: existingStockLinks } = await query.graph({
      entity: StoreLocationStockLocationLink.entryPoint,
      fields: ["store_location_id", "stock_location_id"],
      filters: { store_location_id: storeLocationId },
    })

    if (existingStockLinks.length) {
      logger.info(
        `  ✓ Already linked: ${storeLocationId} → ` +
          `${(existingStockLinks[0] as { stock_location_id: string }).stock_location_id}`
      )
    } else {
      let stockLocationId = process.env.STOCK_LOCATION_ID
      if (!stockLocationId) {
        const stockLocations = await stockLocationService.listStockLocations(
          {},
          { select: ["id", "name"], take: 1 }
        )
        stockLocationId = stockLocations[0]?.id
      }
      if (!stockLocationId) {
        logger.warn("  ⚠ No stock location found — skipping.")
      } else {
        // The link is 1-to-1: a stock location occupied by stale links from
        // DELETED store locations blocks creation. Dismiss those first.
        const { data: occupyingLinks } = await query.graph({
          entity: StoreLocationStockLocationLink.entryPoint,
          fields: ["store_location_id", "stock_location_id"],
          filters: { stock_location_id: stockLocationId },
        })
        for (const link of occupyingLinks as Array<{
          store_location_id: string
        }>) {
          const [stillExists] = await franchiseService.listStoreLocations(
            { id: link.store_location_id },
            { select: ["id"] }
          )
          if (stillExists) continue
          await remoteLink.dismiss({
            franchise: { store_location_id: link.store_location_id },
            [Modules.STOCK_LOCATION]: { stock_location_id: stockLocationId },
          })
          logger.info(
            `  → Dismissed stale link from deleted store location ${link.store_location_id}`
          )
        }

        await remoteLink.create({
          franchise: { store_location_id: storeLocationId },
          [Modules.STOCK_LOCATION]: { stock_location_id: stockLocationId },
        })
        logger.info(`  ✅ Linked ${storeLocationId} → ${stockLocationId}`)
      }
    }
  }

  // ── 4. Re-point the franchise admin user ───────────────────────────────────
  logger.info(`\n[4/4] Linking ${targetEmail} to the live franchise`)

  const users = await userService.listUsers({ email: targetEmail })
  if (!users.length) {
    logger.warn(`  ⚠ User ${targetEmail} not found — skipping.`)
  } else {
    const user = users[0]
    const { data: userLinks } = await query.graph({
      entity: FranchiseUserLink.entryPoint,
      fields: ["franchise_id", "user_id"],
      filters: { user_id: user.id },
    })

    const currentFranchiseId = (
      userLinks[0] as { franchise_id?: string } | undefined
    )?.franchise_id

    // The franchise-user link allows only ONE user per franchise. If another
    // user already holds the live franchise, adding this one would throw.
    const { data: franchiseOwnerLinks } = await query.graph({
      entity: FranchiseUserLink.entryPoint,
      fields: ["user_id"],
      filters: { franchise_id: franchiseId },
    })
    const occupyingUserId = (
      franchiseOwnerLinks[0] as { user_id?: string } | undefined
    )?.user_id

    if (currentFranchiseId === franchiseId) {
      logger.info(`  ✓ Already linked to the live franchise.`)
    } else if (occupyingUserId && occupyingUserId !== user.id) {
      logger.warn(
        `  ⚠ Franchise already has an admin user (${occupyingUserId}) and the ` +
          `franchise-user link is one-user-per-franchise. Skipping ${targetEmail}. ` +
          `Use the existing admin account for franchise-scoped work.`
      )
    } else {
      if (currentFranchiseId) {
        await remoteLink.dismiss({
          [Modules.USER]: { user_id: user.id },
          franchise: { franchise_id: currentFranchiseId },
        })
        logger.info(`  → Dismissed stale link (was ${currentFranchiseId})`)
      }
      await remoteLink.create({
        [Modules.USER]: { user_id: user.id },
        franchise: { franchise_id: franchiseId },
      })
      logger.info(`  ✅ Linked ${targetEmail} → ${franchiseId}`)
    }
  }

  logger.info("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  ✅ Done. Products should now be visible on the storefront.")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
