import ProductModule from "@medusajs/medusa/product"
import ProductReviewModule from "../modules/product_review"
import { defineLink } from "@medusajs/framework/utils"

/**
 * One-to-many: a product has many reviews; each review belongs to exactly
 * one product. Product ownership stays the single source of truth for
 * franchise scoping (join product → franchise-product).
 */
export default defineLink(ProductModule.linkable.product, {
  linkable: ProductReviewModule.linkable.productReview,
  isList: true,
})
