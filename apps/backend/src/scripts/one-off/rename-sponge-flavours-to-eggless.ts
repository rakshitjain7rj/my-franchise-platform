/**
 * Rename catalogue sponge flavour option values (and related variant titles /
 * product.metadata.supported_flavours) to the eggless-prefixed display names:
 *
 *   Victoria Sponge  → Eggless Vanilla
 *   Vanilla          → Eggless Vanilla
 *   Chocolate Sponge → Eggless Chocolate
 *   Chocolate        → Eggless Chocolate
 *   Red Velvet       → Eggless Red Velvet
 *
 * Price-surcharge suffixes (e.g. " + £3.00") are preserved.
 * Exact-match only for free-standing values so names like
 * "Royal Belgian Chocolate" are left alone.
 * Safe to re-run: already-renamed values are left alone.
 *
 * Usage:
 *   cd apps/backend && npx medusa exec ./src/scripts/one-off/rename-sponge-flavours-to-eggless.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** Exact base names (case-insensitive) → new display name. */
const EXACT_BASE_RENAMES: Record<string, string> = {
  "victoria sponge": "Eggless Vanilla",
  vanilla: "Eggless Vanilla",
  "chocolate sponge": "Eggless Chocolate",
  chocolate: "Eggless Chocolate",
  "red velvet": "Eggless Red Velvet",
}

/**
 * Phrases embedded in variant titles (longest first).
 * Not applied as free-word replace for "Chocolate" alone.
 */
const EMBEDDED_PHRASE_RENAMES: Array<{ from: string; to: string }> = [
  { from: "Chocolate Sponge", to: "Eggless Chocolate" },
  { from: "Victoria Sponge", to: "Eggless Vanilla" },
  { from: "Red Velvet", to: "Eggless Red Velvet" },
  { from: "Red velvet", to: "Eggless Red Velvet" },
]

/**
 * Rename a sponge option value. Exact base match only (plus optional
 * " + £X.XX" surcharge suffix from Magento import).
 */
export function renameSpongeOptionValue(value: string): string {
  const trimmed = value.trim()
  const surchargeMatch = trimmed.match(/^(.*?)(\s*\+\s*£[\d.]+)\s*$/i)
  const base = (surchargeMatch ? surchargeMatch[1] : trimmed).trim()
  const surcharge = surchargeMatch ? surchargeMatch[2] : ""

  const mapped = EXACT_BASE_RENAMES[base.toLowerCase()]
  if (!mapped) return value
  return mapped + surcharge
}

/** Rewrite sponge phrases inside composite variant titles. */
export function renameSpongeInTitle(title: string): string {
  let out = title
  for (const { from, to } of EMBEDDED_PHRASE_RENAMES) {
    if (out.includes(from)) {
      out = out.split(from).join(to)
    }
  }
  return out
}

function renameSupportedFlavours(raw: unknown): string | null {
  if (raw == null) return null
  let list: string[] | null = null
  if (Array.isArray(raw)) {
    list = raw.map(String)
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) list = parsed.map(String)
    } catch {
      return null
    }
  }
  if (!list) return null
  const next = list.map((f) => renameSpongeOptionValue(f))
  if (next.every((v, i) => v === list![i])) return null
  return JSON.stringify(next)
}

export default async function renameSpongeFlavoursToEggless({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Rename sponge flavours → Eggless Vanilla /")
  logger.info("  Eggless Chocolate / Eggless Red Velvet")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  let optionValuesUpdated = 0
  let variantsUpdated = 0
  let productsMetaUpdated = 0

  await knex.transaction(async (trx: any) => {
    // 1) product_option_value.value (Sponge / Flavor options)
    const { rows: optionValues } = await trx.raw(`
      SELECT pov.id, pov.value
      FROM product_option_value pov
      JOIN product_option po ON po.id = pov.option_id
      WHERE po.title ~* '^(flavou?r|sponge)(\\s*[0-9]+)?$'
        AND pov.deleted_at IS NULL
    `)

    for (const row of optionValues as Array<{ id: string; value: string }>) {
      const next = renameSpongeOptionValue(row.value)
      if (next === row.value) continue
      await trx("product_option_value").where({ id: row.id }).update({
        value: next,
        updated_at: trx.fn.now(),
      })
      optionValuesUpdated++
      logger.info(`  option value: "${row.value}" → "${next}"`)
    }

    // 2) product_variant.title (e.g. '8" / Victoria Sponge')
    const { rows: variants } = await trx.raw(`
      SELECT id, title
      FROM product_variant
      WHERE deleted_at IS NULL
        AND (
          title ILIKE '%Victoria Sponge%'
          OR title ILIKE '%Chocolate Sponge%'
          OR title ILIKE '%Red Velvet%'
          OR title ILIKE '%Red velvet%'
        )
    `)

    for (const row of variants as Array<{ id: string; title: string }>) {
      const next = renameSpongeInTitle(row.title)
      if (next === row.title) continue
      await trx("product_variant").where({ id: row.id }).update({
        title: next,
        updated_at: trx.fn.now(),
      })
      variantsUpdated++
    }

    // 3) product.metadata.supported_flavours
    const { rows: products } = await trx.raw(`
      SELECT id, metadata
      FROM product
      WHERE deleted_at IS NULL
        AND metadata IS NOT NULL
        AND metadata::text ILIKE '%supported_flavours%'
    `)

    for (const row of products as Array<{
      id: string
      metadata: Record<string, unknown> | string | null
    }>) {
      let meta: Record<string, unknown>
      if (typeof row.metadata === "string") {
        try {
          meta = JSON.parse(row.metadata)
        } catch {
          continue
        }
      } else {
        meta = { ...(row.metadata ?? {}) }
      }

      const nextJson = renameSupportedFlavours(meta.supported_flavours)
      if (!nextJson) continue
      meta.supported_flavours = nextJson
      await trx("product").where({ id: row.id }).update({
        metadata: meta,
        updated_at: trx.fn.now(),
      })
      productsMetaUpdated++
    }
  })

  logger.info("─────────────────────────────────────────────────")
  logger.info(`  Option values updated:    ${optionValuesUpdated}`)
  logger.info(`  Variant titles updated:   ${variantsUpdated}`)
  logger.info(`  Product metadata updated: ${productsMetaUpdated}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
