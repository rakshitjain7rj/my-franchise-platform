/**
 * normalize-product-title-codes.ts
 *
 * Compact Magento-style leading product codes in titles by stripping
 * spaces / punctuation inside the first parentheses.
 *
 *   (Tall 91) Floral…  →  (Tall91) Floral…
 *   ( C13 )Cup Cakes   →  (C13)Cup Cakes
 *   (UM-2) FRUIT…      →  (UM2) FRUIT…
 *   (R1) stays (R1)
 *
 * Only rewrites when the leading (CODE) contains non-alphanumeric chars.
 * Keeps letter case of the remaining characters.
 *
 * Env:
 *   DRY_RUN=1          Preview only (default). Set DRY_RUN=0 to write.
 *   TITLE_CODE_LIMIT   Optional max products to update (safety).
 *
 * Usage:
 *   # local (apps/backend/.env DATABASE_URL)
 *   cd apps/backend && DRY_RUN=1 npx medusa exec ./src/scripts/one-off/normalize-product-title-codes.ts
 *   cd apps/backend && DRY_RUN=0 npx medusa exec ./src/scripts/one-off/normalize-product-title-codes.ts
 *
 *   # docker backend
 *   docker compose --env-file .env.docker exec -e DRY_RUN=0 backend \
 *     npx medusa exec ./src/scripts/one-off/normalize-product-title-codes.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

const LEADING_CODE_RE = /^\(([^)]+)\)/

/** Strip non-alphanumeric from a code token; preserve alnum case. */
export function compactTitleCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "")
}

/**
 * If title starts with (CODE) containing spaces/punctuation, return the
 * compacted title; otherwise null (no change needed).
 */
export function compactedTitleOrNull(
  title: string | null | undefined
): string | null {
  if (!title?.trim()) return null
  const m = title.match(LEADING_CODE_RE)
  if (!m?.[1]) return null
  const raw = m[1]
  if (!/[^A-Za-z0-9]/.test(raw)) return null
  const compact = compactTitleCode(raw)
  if (!compact || compact === raw) return null
  return `(${compact})${title.slice(m[0].length)}`
}

function isDryRun(): boolean {
  const v = process.env.DRY_RUN
  if (v == null || v === "") return true
  return !["0", "false", "no", "off"].includes(v.toLowerCase())
}

function parseLimit(): number | null {
  const raw = process.env.TITLE_CODE_LIMIT?.trim()
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return null
  return Math.floor(n)
}

export default async function normalizeProductTitleCodes({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as {
    listAndCountProducts: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      [
        Array<{ id: string; title: string; handle?: string | null }>,
        number,
      ]
    >
    updateProducts: (
      id: string,
      data: { title: string }
    ) => Promise<unknown>
  }

  const dryRun = isDryRun()
  const limit = parseLimit()

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Normalize product title codes  (spaces → compact)")
  logger.info(`  Mode: ${dryRun ? "DRY_RUN (no writes)" : "APPLY (will update)"}`)
  if (limit != null) logger.info(`  Limit: ${limit}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  const PAGE = 100
  let skip = 0
  const candidates: Array<{
    id: string
    handle: string | null
    from: string
    to: string
  }> = []

  for (;;) {
    const [products, total] = await productService.listAndCountProducts(
      {},
      {
        select: ["id", "title", "handle"],
        take: PAGE,
        skip,
        order: { title: "ASC" },
      }
    )
    if (!products.length) break

    for (const p of products) {
      const to = compactedTitleOrNull(p.title)
      if (!to) continue
      candidates.push({
        id: p.id,
        handle: p.handle ?? null,
        from: p.title,
        to,
      })
    }

    skip += products.length
    if (skip >= total || products.length < PAGE) break
  }

  const toProcess =
    limit != null ? candidates.slice(0, limit) : candidates

  logger.info(`  Found ${candidates.length} product(s) needing code compacting`)
  if (limit != null && candidates.length > limit) {
    logger.info(`  Processing first ${toProcess.length} (TITLE_CODE_LIMIT)`)
  }

  for (const row of toProcess) {
    logger.info(`  · ${row.handle ?? row.id}`)
    logger.info(`      from: ${row.from}`)
    logger.info(`      to:   ${row.to}`)
  }

  if (dryRun) {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info(
      `  DRY_RUN complete — ${candidates.length} would be updated. Re-run with DRY_RUN=0 to apply.`
    )
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return
  }

  let updated = 0
  for (const row of toProcess) {
    await productService.updateProducts(row.id, { title: row.to })
    updated++
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  Applied ${updated} title update(s).`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
