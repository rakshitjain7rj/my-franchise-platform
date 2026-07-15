import { MedusaService } from "@medusajs/framework/utils"
import ProductReview from "./models/product_review"

// Snake_case key matches the table/model name so generated methods are
// listProduct_reviews / createProduct_reviews / updateProduct_reviews
// (same convention as dietary_tag).
class ProductReviewModuleService extends MedusaService({
  product_review: ProductReview,
}) {}

export default ProductReviewModuleService
