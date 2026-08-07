/**
 * delete-products-by-codes.ts
 *
 * Deletes catalogue products whose variant SKUs match a product code prefix
 * (e.g. S10 → S10-8AP-CHO, S10-10A-VIC, …). Also matches titles like "(S10) …".
 *
 * Uses deleteProductsWorkflow so franchise / sales-channel / inventory links
 * are cleaned up correctly. Clears inventory reservations first — production
 * often blocks product delete when carts/orders still hold stock reservations.
 *
 * Codes (default — tall cakes requested for removal):
 *   TALL10,TALL11,TALL12,TALL13,TALL14,TALL17,TALL18,TALL20,TALL22,TALL25,
 *   TALL32,TALL38,TALL39,TALL43,TALL48,TALL53,TALL56,TALL58,TALL61,TALL62,
 *   TALL69,TALL70,TALL73,TALL75,TALL76,TALL81,TALL82,TALL86,TALL88,TALL89
 *
 * Override via env:
 *   DELETE_PRODUCT_CODES=TALL10,TALL11
 *   CLEAR_RESERVATIONS=0   # skip reservation cleanup (default: clear)
 *
 * Usage:
 *   npx medusa exec ./src/scripts/one-off/delete-products-by-codes.ts
 *   # production image has compiled .js — use that path in containers:
 *   npx medusa exec ./src/scripts/one-off/delete-products-by-codes.js
 *   # docker:
 *   docker compose --env-file .env.docker exec backend \
 *     npx medusa exec ./src/scripts/one-off/delete-products-by-codes.js
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

const DEFAULT_CODES = [
  "TALL10",
  "TALL11",
  "TALL12",
  "TALL13",
  "TALL14",
  "TALL17",
  "TALL18",
  "TALL20",
  "TALL22",
  "TALL25",
  "TALL32",
  "TALL38",
  "TALL39",
  "TALL43",
  "TALL48",
  "TALL53",
  "TALL56",
  "TALL58",
  "TALL61",
  "TALL62",
  "TALL69",
  "TALL70",
  "TALL73",
  "TALL75",
  "TALL76",
  "TALL81",
  "TALL82",
  "TALL86",
  "TALL88",
  "TALL89",
]

function parseCodes(): string[] {
  const raw = process.env.DELETE_PRODUCT_CODES?.trim()
  if (!raw) return DEFAULT_CODES
  return raw
    .split(/[,\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
}

/** Sort longest-first so S111 is not swallowed by a shorter S11 match. */
function sortedCodes(codes: string[]): string[] {
  return [...codes].sort((a, b) => b.length - a.length || a.localeCompare(b))
}

function codeFromSku(sku: string | null | undefined, codes: string[]): string | null {
  if (!sku) return null
  const upper = sku.toUpperCase()
  for (const code of codes) {
    if (upper === code || upper.startsWith(`${code}-`)) return code
  }
  return null
}

function codeFromTitle(title: string | null | undefined, codes: string[]): string | null {
  if (!title) return null
  const m = title.match(/^\(([A-Za-z0-9]+)\)/)
  if (!m) return null
  const token = m[1].toUpperCase()
  return codes.includes(token) ? token : null
}

export default async function deleteProductsByCodes({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const codes = sortedCodes(parseCodes())
  const codeSet = new Set(codes)

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Delete products by catalogue codes")
  logger.info(`  Codes: ${codes.join(", ")}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // Paginate all non-deleted products with variant SKUs.
  const matched = new Map<
    string,
    { id: string; title: string; handle?: string | null; codes: Set<string> }
  >()
  const PAGE = 100
  let skip = 0

  for (let pass = 0; pass < 500; pass++) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "variants.sku"],
      pagination: { take: PAGE, skip },
    })

    if (!products?.length) break

    for (const p of products as Array<{
      id?: string
      title?: string
      handle?: string | null
      variants?: Array<{ sku?: string | null }> | null
    }>) {
      if (!p.id) continue
      const found = new Set<string>()

      const fromTitle = codeFromTitle(p.title, codes)
      if (fromTitle && codeSet.has(fromTitle)) found.add(fromTitle)

      for (const v of p.variants ?? []) {
        const c = codeFromSku(v.sku, codes)
        if (c && codeSet.has(c)) found.add(c)
      }

      if (found.size) {
        matched.set(p.id, {
          id: p.id,
          title: p.title ?? p.id,
          handle: p.handle,
          codes: found,
        })
      }
    }

    if (products.length < PAGE) break
    skip += PAGE
  }

  if (!matched.size) {
    logger.info("No matching products found — nothing to delete.")
    const missing = codes.filter((c) => {
      // report which codes never matched
      for (const m of matched.values()) {
        if (m.codes.has(c)) return false
      }
      return true
    })
    if (missing.length) {
      logger.info(`Codes with no product: ${missing.join(", ")}`)
    }
    return
  }

  // Report coverage per requested code
  const foundCodes = new Set<string>()
  for (const m of matched.values()) {
    for (const c of m.codes) foundCodes.add(c)
  }
  const missingCodes = codes.filter((c) => !foundCodes.has(c))

  const list = [...matched.values()].sort((a, b) =>
    a.title.localeCompare(b.title)
  )
  logger.info(`Matched ${list.length} product(s):`)
  for (const m of list) {
    logger.info(
      `  - [${[...m.codes].join(",")}] ${m.title} (${m.handle ?? m.id})`
    )
  }
  if (missingCodes.length) {
    logger.warn(`Codes with no product: ${missingCodes.join(", ")}`)
  }

  const ids = list.map((m) => m.id)

  // Clear stock reservations on linked inventory items so deleteProductsWorkflow
  // is not blocked (common when open carts/checkouts reserved those variants).
  const clearReservations = !["0", "false", "no", "off"].includes(
    (process.env.CLEAR_RESERVATIONS ?? "1").toLowerCase()
  )
  if (clearReservations) {
    const inventoryService = container.resolve(Modules.INVENTORY) as {
      listReservationItems: (
        selector: Record<string, unknown>,
        config?: Record<string, unknown>
      ) => Promise<Array<{ id: string; inventory_item_id?: string }>>
      deleteReservationItems: (ids: string | string[]) => Promise<void>
    }

    const invItemIds = new Set<string>()
    // Graph in chunks — filters by id array can be large.
    const ID_CHUNK = 50
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const chunk = ids.slice(i, i + ID_CHUNK)
      const { data: productsWithInv } = await query.graph({
        entity: "product",
        fields: [
          "id",
          "variants.inventory_items.inventory_item_id",
        ],
        filters: { id: chunk },
      })
      for (const p of (productsWithInv ?? []) as Array<{
        variants?: Array<{
          inventory_items?: Array<{ inventory_item_id?: string | null }> | null
        }> | null
      }>) {
        for (const v of p.variants ?? []) {
          for (const link of v.inventory_items ?? []) {
            if (link?.inventory_item_id) invItemIds.add(link.inventory_item_id)
          }
        }
      }
    }

    if (invItemIds.size) {
      const invIds = [...invItemIds]
      const reservationIds: string[] = []
      // listReservationItems may not accept huge IN lists; chunk.
      for (let i = 0; i < invIds.length; i += ID_CHUNK) {
        const chunk = invIds.slice(i, i + ID_CHUNK)
        const rows = await inventoryService.listReservationItems(
          { inventory_item_id: chunk },
          { take: 10_000 }
        )
        for (const r of rows) {
          if (r.id) reservationIds.push(r.id)
        }
      }
      if (reservationIds.length) {
        logger.info(
          `Clearing ${reservationIds.length} inventory reservation(s) on ${invItemIds.size} inventory item(s)…`
        )
        await inventoryService.deleteReservationItems(reservationIds)
      } else {
        logger.info(
          `No inventory reservations on ${invItemIds.size} inventory item(s).`
        )
      }
    }
  }

  await deleteProductsWorkflow(container).run({
    input: { ids },
  })

  logger.info(`Done. Deleted ${ids.length} product(s).`)
}
