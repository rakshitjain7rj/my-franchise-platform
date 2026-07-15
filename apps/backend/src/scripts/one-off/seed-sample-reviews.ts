/**
 * Seeds a few approved (and one pending) product reviews for local QA.
 *
 * Usage:
 *   cd apps/backend && npx medusa exec ./src/scripts/one-off/seed-sample-reviews.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import ProductReviewLink from "../../links/product-review"
import { PRODUCT_REVIEW_MODULE } from "../../modules/product_review"

const SAMPLES = [
  {
    rating: 5,
    nickname: "Priya S.",
    title: "Birthday perfection",
    content:
      "Ordered the chocolate gateau for my daughter's birthday. Moist, rich, and the inscription was beautifully written. Will order again!",
    status: "approved" as const,
  },
  {
    rating: 4,
    nickname: "James K.",
    title: "Great for the office",
    content:
      "We collected from the local branch — staff were lovely and the cake looked exactly like the photos. Slightly sweet for my taste but the team loved it.",
    status: "approved" as const,
  },
  {
    rating: 5,
    nickname: "Aisha R.",
    title: "Truly eggless and delicious",
    content:
      "As someone who avoids eggs, finding a bakery this good is rare. Texture was light and the Victoria sponge flavour was spot on.",
    status: "approved" as const,
  },
  {
    rating: 3,
    nickname: "Pending Pete",
    title: "Awaiting moderation",
    content:
      "This review should stay hidden until an admin approves it from the Product Reviews screen.",
    status: "pending" as const,
  },
]

export default async function seedSampleReviews({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const productService = container.resolve(Modules.PRODUCT)
  const reviewService = container.resolve(PRODUCT_REVIEW_MODULE) as {
    createProduct_reviews: (
      data: Record<string, unknown> | Record<string, unknown>[]
    ) => Promise<
      | { id: string }
      | Array<{ id: string }>
    >
    listProduct_reviews: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ id: string; nickname: string }>>
  }

  const products = await productService.listProducts({}, { take: 3 })
  if (!products.length) {
    logger.warn("No products found — seed catalogue first.")
    return
  }

  // Skip if we already seeded these nicknames
  const existing = await reviewService.listProduct_reviews(
    { nickname: SAMPLES.map((s) => s.nickname) },
    { take: 20 }
  )
  if (existing.length >= SAMPLES.length) {
    logger.info("Sample reviews already present — skipping.")
    return
  }

  let created = 0
  for (let i = 0; i < SAMPLES.length; i++) {
    const sample = SAMPLES[i]
    const product = products[i % products.length] as { id: string; title: string }

    const row = await reviewService.createProduct_reviews({
      rating: sample.rating,
      title: sample.title,
      content: sample.content,
      nickname: sample.nickname,
      status: sample.status,
      is_verified_purchase: sample.status === "approved",
    })
    const review = Array.isArray(row) ? row[0] : row

    // Avoid duplicate links
    const { data: links } = await query.graph({
      entity: ProductReviewLink.entryPoint,
      fields: ["product_review_id"],
      filters: { product_review_id: review.id },
    })
    if (!links?.length) {
      await remoteLink.create({
        [Modules.PRODUCT]: { product_id: product.id },
        product_review: { product_review_id: review.id },
      })
    }

    created++
    logger.info(
      `  ✓ ${sample.status} review by ${sample.nickname} on ${product.title}`
    )
  }

  logger.info(`Seeded ${created} sample reviews across ${products.length} products.`)
}
