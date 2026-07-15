import ProductModule from "@medusajs/medusa/product"
import DietaryTagModule from "../modules/dietary_tag"
import { defineLink } from "@medusajs/framework/utils"

// Many-to-many: a product can carry multiple dietary claims (Eggless, Vegan,
// Halal, …) and each claim can apply to many products. Both sides are lists.
export default defineLink(
  {
    linkable: ProductModule.linkable.product,
    isList: true,
  },
  {
    linkable: DietaryTagModule.linkable.dietaryTag,
    isList: true,
  }
)
