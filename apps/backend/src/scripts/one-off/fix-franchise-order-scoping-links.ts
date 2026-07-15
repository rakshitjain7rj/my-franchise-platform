/**
 * fix-franchise-order-scoping-links.ts
 *
 * Repairs the two link tables the ADMIN order views depend on. Both the
 * native /admin/orders scoping (scope-franchise-orders.ts) and the
 * /admin/cake-orders feed resolve the caller's franchise to its store /
 * sales channel(s); when those links are missing or point at a deleted
 * franchise, a franchise admin sees an EMPTY order list even though orders
 * exist (fail-closed scoping).
 *
 * What it does (idempotent — every step checks current state first):
 *   1. franchise ←→ store        : dismiss rows whose franchise no longer
 *      exists; ensure the live franchise is linked to the Medusa store.
 *   2. franchise ←→ sales_channel: ensure the live franchise is linked to the
 *      store's default sales channel (the one carts/orders are created under).
 *   3. franchise ←→ user         : dismiss rows whose franchise no longer
 *      exists (stale rows shadow nothing but pollute allow-list resolution).
 *
 * Usage:
 *   npx medusa exec ./src/scripts/fix-franchise-order-scoping-links.ts
 *
 * Env overrides:
 *   FRANCHISE_ID      (default: the single existing franchise)
 *   STORE_ID          (default: first store with a default sales channel)
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import FranchiseStoreLink from "../../links/franchise-store"
import FranchiseSalesChannelLink from "../../links/franchise-sales-channel"
import FranchiseUserLink from "../../links/franchise-user"

export default async function fixFranchiseOrderScopingLinks({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")

  // ── Resolve the live franchise ─────────────────────────────────────────────
  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id", "name"],
    filters: {},
  })
  if (!franchises.length) throw new Error("No franchise exists.")

  const franchiseId = process.env.FRANCHISE_ID ?? (franchises[0] as any).id
  const liveFranchiseIds = new Set(
    (franchises as Array<{ id: string }>).map((f) => f.id)
  )
  logger.info(
    `Live franchise: ${franchiseId} (${(franchises[0] as any).name ?? "?"})`
  )

  // ── Resolve the target store + its default sales channel ──────────────────
  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["id", "default_sales_channel_id"],
    filters: {},
  })
  const store =
    (stores as Array<{ id: string; default_sales_channel_id?: string }>).find(
      (s) =>
        process.env.STORE_ID
          ? s.id === process.env.STORE_ID
          : Boolean(s.default_sales_channel_id)
    ) ?? null
  if (!store?.default_sales_channel_id) {
    throw new Error("No store with a default sales channel found.")
  }
  logger.info(
    `Target store: ${store.id} → sales channel ${store.default_sales_channel_id}`
  )

  // ── 1. franchise ←→ store ──────────────────────────────────────────────────
  const { data: storeLinks } = await query.graph({
    entity: FranchiseStoreLink.entryPoint,
    fields: ["franchise_id", "store_id"],
    filters: {},
  })

  let hasLiveStoreLink = false
  for (const link of storeLinks as Array<{
    franchise_id?: string
    store_id?: string
  }>) {
    if (!link.franchise_id || !link.store_id) continue
    if (!liveFranchiseIds.has(link.franchise_id)) {
      await remoteLink.dismiss({
        franchise: { franchise_id: link.franchise_id },
        [Modules.STORE]: { store_id: link.store_id },
      })
      logger.info(
        `  → Dismissed stale franchise-store link (deleted franchise ${link.franchise_id})`
      )
    } else if (link.franchise_id === franchiseId && link.store_id === store.id) {
      hasLiveStoreLink = true
    }
  }

  if (!hasLiveStoreLink) {
    await remoteLink.create({
      franchise: { franchise_id: franchiseId },
      [Modules.STORE]: { store_id: store.id },
    })
    logger.info(`  ✅ Linked franchise → store ${store.id}`)
  } else {
    logger.info("  ✓ franchise-store link already present")
  }

  // ── 2. franchise ←→ sales channel ─────────────────────────────────────────
  const { data: scLinks } = await query.graph({
    entity: FranchiseSalesChannelLink.entryPoint,
    fields: ["franchise_id", "sales_channel_id"],
    filters: { franchise_id: franchiseId },
  })

  const linkedChannelIds = new Set(
    (scLinks as Array<{ sales_channel_id?: string }>)
      .map((l) => l.sales_channel_id)
      .filter(Boolean)
  )

  if (!linkedChannelIds.has(store.default_sales_channel_id)) {
    await remoteLink.create({
      franchise: { franchise_id: franchiseId },
      [Modules.SALES_CHANNEL]: {
        sales_channel_id: store.default_sales_channel_id,
      },
    })
    logger.info(
      `  ✅ Linked franchise → sales channel ${store.default_sales_channel_id}`
    )
  } else {
    logger.info("  ✓ franchise-sales-channel link already present")
  }

  // ── 3. Clean stale franchise ←→ user links ────────────────────────────────
  const { data: userLinks } = await query.graph({
    entity: FranchiseUserLink.entryPoint,
    fields: ["franchise_id", "user_id"],
    filters: {},
  })

  for (const link of userLinks as Array<{
    franchise_id?: string
    user_id?: string
  }>) {
    if (!link.franchise_id || !link.user_id) continue
    if (!liveFranchiseIds.has(link.franchise_id)) {
      // The franchise-user link is defined user-first (see links/franchise-user.ts)
      await remoteLink.dismiss({
        [Modules.USER]: { user_id: link.user_id },
        franchise: { franchise_id: link.franchise_id },
      })
      logger.info(
        `  → Dismissed stale franchise-user link (${link.user_id} → deleted franchise ${link.franchise_id})`
      )
    }
  }

  logger.info("Done. Franchise admin order scoping now resolves correctly.")
}
