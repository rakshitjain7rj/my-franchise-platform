/**
 * one-off/add-dh35-round-category.ts
 *
 * Ensures (Dh35) Pink & White buttercream Cake is in Round Cakes
 * as well as Novelty / Kids (client request).
 *
 * Run:
 *   npx medusa exec ./src/scripts/one-off/add-dh35-round-category.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const TARGET_HANDLES = [
  "dh35-pink-white-buttercream-cake",
]

const TITLE_MATCH = /dh\s*35|pink\s*&\s*white\s*buttercream/i

export default async function addDh35RoundCategory({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        id: string
        title?: string
        handle?: string
        categories?: Array<{ id: string; handle?: string }>
      }>
    >
    updateProducts: (
      id: string,
      data: { category_ids: string[] }
    ) => Promise<unknown>
    listProductCategories: (
      filters: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ id: string; handle: string; name?: string }>>
  }

  const cats = await productService.listProductCategories(
    {},
    { take: 200, select: ["id", "handle", "name"] }
  )
  const byHandle = new Map(cats.map((c) => [c.handle, c.id]))
  const roundId = byHandle.get("round-cakes")
  const noveltyId = byHandle.get("novelty-kids-cakes")

  if (!roundId) {
    throw new Error("Category handle round-cakes not found")
  }

  logger.info(`round-cakes id=${roundId}`)
  if (noveltyId) logger.info(`novelty-kids-cakes id=${noveltyId}`)

  // Load candidates by handle first, then title scan if needed
  const products: Array<{
    id: string
    title?: string
    handle?: string
    categories?: Array<{ id: string; handle?: string }>
  }> = []

  for (const handle of TARGET_HANDLES) {
    const found = await productService.listProducts(
      { handle },
      {
        take: 5,
        relations: ["categories"],
        select: ["id", "title", "handle"],
      }
    )
    products.push(...found)
  }

  if (!products.length) {
    // Fallback: page products and match title
    let skip = 0
    const pageSize = 100
    for (;;) {
      const batch = await productService.listProducts(
        {},
        {
          take: pageSize,
          skip,
          relations: ["categories"],
          select: ["id", "title", "handle"],
        }
      )
      if (!batch?.length) break
      for (const p of batch) {
        if (
          TARGET_HANDLES.includes((p.handle || "").toLowerCase()) ||
          TITLE_MATCH.test(p.title || "")
        ) {
          products.push(p)
        }
      }
      if (batch.length < pageSize) break
      skip += pageSize
    }
  }

  // Dedupe
  const byId = new Map(products.map((p) => [p.id, p]))
  const unique = Array.from(byId.values())

  if (!unique.length) {
    logger.warn("No matching DH35 product found")
    return
  }

  for (const product of unique) {
    const existing = new Set(
      (product.categories || []).map((c) => c.id).filter(Boolean)
    )
    // Keep existing categories; ensure novelty + round
    if (noveltyId) existing.add(noveltyId)
    existing.add(roundId)

    const categoryIds = Array.from(existing)
    await productService.updateProducts(product.id, {
      category_ids: categoryIds,
    })

    const names = (product.categories || [])
      .map((c) => c.handle)
      .concat(["round-cakes"])
    logger.info(
      `Updated ${product.title} (${product.handle}) → categories now include round-cakes (ids=${categoryIds.length})`
    )
    logger.info(`  prior handles: ${names.join(", ")}`)
  }

  logger.info("DH35 round category assignment complete")
}
