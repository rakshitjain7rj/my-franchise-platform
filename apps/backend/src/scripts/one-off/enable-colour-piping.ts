/**
 * Enable colour piping on products that offer Magento-style COLOUR PIPING.
 *
 * Sets product.metadata.supports_colour_piping = "true" so the storefront
 * shows Pink / Yellow / Green / Blue / Lilac / Beige (default palette).
 *
 * Default target: cream-cake-r3 (Pink And White Theme Cream Cake).
 * Override with env COLOUR_PIPING_HANDLES=handle1,handle2
 *
 * Usage:
 *   cd apps/backend && npx medusa exec ./src/scripts/one-off/enable-colour-piping.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

const DEFAULT_HANDLES = ["cream-cake-r3"]

function resolveHandles(): string[] {
  const fromEnv = process.env.COLOUR_PIPING_HANDLES
  if (fromEnv?.trim()) {
    return fromEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return DEFAULT_HANDLES
}

export default async function enableColourPiping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        id: string
        title: string
        handle: string
        metadata?: Record<string, unknown> | null
      }>
    >
    updateProducts: (
      id: string,
      data: Record<string, unknown>
    ) => Promise<unknown>
  }

  const handles = resolveHandles()

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Enable colour piping (supports_colour_piping)")
  logger.info(`  Handles: ${handles.join(", ")}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  let updated = 0
  let skipped = 0
  let missing = 0

  for (const handle of handles) {
    const [product] = await productService.listProducts(
      { handle },
      { take: 1 }
    )

    if (!product) {
      logger.warn(`  ✗ Not found: ${handle}`)
      missing++
      continue
    }

    const meta = { ...(product.metadata ?? {}) }
    if (meta.supports_colour_piping === "true" || meta.supports_colour_piping === true) {
      logger.info(`  · Already enabled: ${product.title} (${handle})`)
      skipped++
      continue
    }

    meta.supports_colour_piping = "true"
    await productService.updateProducts(product.id, { metadata: meta })
    logger.info(`  ✓ Enabled: ${product.title} (${handle})`)
    updated++
  }

  logger.info("─────────────────────────────────────────────────")
  logger.info(`  Updated: ${updated}  Already on: ${skipped}  Missing: ${missing}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
