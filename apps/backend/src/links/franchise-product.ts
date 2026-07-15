import FranchiseModule from "../modules/franchise"
import ProductModule from "@medusajs/medusa/product"
import { defineLink } from "@medusajs/framework/utils"

// One-to-many: a franchise owns many products, and every product belongs to
// exactly ONE franchise. Franchises never share catalogue/inventory, so this is
// the correct cardinality — only the franchise side is a list. This link table
// is the single source of truth for franchise↔product ownership; the former
// `metadata.franchise_ids` fallback has been retired.
export default defineLink(FranchiseModule.linkable.franchise, {
  linkable: ProductModule.linkable.product,
  isList: true,
})
