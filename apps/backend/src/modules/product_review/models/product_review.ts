import { model } from "@medusajs/framework/utils"

/**
 * ProductReview — customer review awaiting bakery moderation.
 *
 * Product ownership is expressed via `src/links/product-review.ts`
 * (never a raw product_id FK). Status starts as `pending`; only
 * `approved` reviews are returned on the storefront.
 */
const ProductReview = model.define("product_review", {
  id: model.id({ prefix: "prev" }).primaryKey(),

  /** Star rating 1–5 (validated in API layer). */
  rating: model.number(),

  /** Optional short summary shown in bold above the body. */
  title: model.text().nullable(),

  /** Review body / comment. */
  content: model.text(),

  /** Display name chosen by the reviewer (guest-friendly). */
  nickname: model.text(),

  /** Set when the submitter had a customer session. */
  customer_id: model.text().nullable(),

  /** Optional contact email (never shown on storefront). */
  email: model.text().nullable(),

  /**
   * Moderation pipeline:
   *  - pending  → freshly submitted, hidden from store
   *  - approved → visible on product page
   *  - rejected → permanently hidden
   */
  status: model
    .enum(["pending", "approved", "rejected"])
    .default("pending"),

  /**
   * True when the author is known to have purchased the product.
   * Default false; may be promoted later by order-matching logic.
   */
  is_verified_purchase: model.boolean().default(false),
})

export default ProductReview
