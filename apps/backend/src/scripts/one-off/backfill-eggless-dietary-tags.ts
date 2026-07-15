/**
 * Links the existing "eggless" dietary_tag to every product that does not
 * already have the product-dietary-tag link. Cake Break catalogue is
 * egg-free by brand positioning; this wires the relation the storefront
 * already reads.
 *
 * Usage:
 *   cd apps/backend && npx medusa exec ./src/scripts/one-off/backfill-eggless-dietary-tags.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import ProductDietaryTagLink from "../../links/product-dietary-tag"

export default async function backfillEgglessDietaryTags({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const productService = container.resolve(Modules.PRODUCT)
  const dietaryTagService = container.resolve("dietary_tag") as {
    listDietary_tags: (
      filters?: Record<string, unknown>
    ) => Promise<Array<{ id: string; name: string; slug: string }>>
    createDietary_tags: (
      data: Record<string, unknown>
    ) => Promise<{ id: string; name: string; slug: string }>
  }

  logger.info("Linking eggless dietary tag to products…")

  const [existing] = await dietaryTagService.listDietary_tags({
    slug: "eggless",
  })
  const tag =
    existing ??
    (await dietaryTagService.createDietary_tags({
      name: "Eggless",
      slug: "eggless",
      description: "Prepared without eggs. Uses plant-based binders.",
      is_active: true,
    }))

  logger.info(`Using dietary tag: ${tag.name} (${tag.id})`)

  const products = await productService.listProducts({}, { take: 500 })
  const { data: existingLinks } = await query.graph({
    entity: ProductDietaryTagLink.entryPoint,
    fields: ["product_id", "dietary_tag_id"],
    filters: { dietary_tag_id: tag.id },
  })

  const already = new Set(
    (existingLinks as Array<{ product_id?: string }>).map((l) => l.product_id)
  )

  let linked = 0
  for (const product of products as Array<{ id: string; title: string }>) {
    if (already.has(product.id)) continue
    try {
      await remoteLink.create({
        [Modules.PRODUCT]: { product_id: product.id },
        dietary_tag: { dietary_tag_id: tag.id },
      })
      linked++
    } catch (e: any) {
      logger.warn(`Skip ${product.title}: ${e.message}`)
    }
  }

  logger.info(
    `Done. Newly linked: ${linked}. Already linked: ${already.size}. Total products: ${products.length}.`
  )
}
