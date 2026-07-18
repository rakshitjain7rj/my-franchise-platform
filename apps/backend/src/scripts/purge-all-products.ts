/**
 * purge-all-products.ts
 *
 * Deletes every product in the catalogue (Medusa demo SKUs, seed cakes, prior
 * imports). Uses deleteProductsWorkflow so franchise / sales-channel /
 * inventory links are cleaned up correctly.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/purge-all-products.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

const BATCH = 100

export default async function purgeAllProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Purge ALL products")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  let totalDeleted = 0

  // Loop until no products remain (handles soft-delete edges / large sets).
  for (let pass = 1; pass <= 50; pass++) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle"],
      pagination: { take: BATCH, skip: 0 },
    })

    if (!products?.length) {
      if (totalDeleted === 0) {
        logger.info("No products found — catalogue already empty.")
      } else {
        logger.info(`Done. Deleted ${totalDeleted} product(s) total.`)
      }
      return
    }

    const ids = products
      .map((p: { id?: string }) => p.id)
      .filter((id): id is string => Boolean(id))

    logger.info(
      `Pass ${pass}: deleting ${ids.length} product(s) ` +
        `(e.g. ${(products as Array<{ handle?: string }>).slice(0, 3).map((p) => p.handle).join(", ")})`
    )

    await deleteProductsWorkflow(container).run({
      input: { ids },
    })

    totalDeleted += ids.length
  }

  logger.warn(
    `Stopped after 50 passes (${totalDeleted} deleted). ` +
      `Re-run if products remain.`
  )
}
