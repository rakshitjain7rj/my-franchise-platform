import ProductModule from "@medusajs/medusa/product"
import { defineLink } from "@medusajs/framework/utils"
import FranchiseModule from "../modules/franchise"

/**
 * StoreLocation ←→ Product (Per-store availability OVERRIDE)
 *
 * ⚠️ This link is deliberately SEPARATE from and orthogonal to the
 * `franchise-product` link. It does NOT express ownership — every product is
 * still owned by exactly ONE franchise via the one-to-many franchise-product
 * link (the single source of truth, never to be made many-to-many).
 *
 * This link expresses per-branch AVAILABILITY within that franchise, so a
 * multi-store franchise can make a product either shared across all its stores
 * or exclusive to some.
 *
 * Availability semantics (IMPORTANT — "shared by default"):
 *   - A product with NO rows in this link table is available at ALL stores in
 *     its franchise. This is the default, so existing catalogues need zero
 *     migration and stay fully shared.
 *   - A product WITH one or more rows is RESTRICTED to exactly the listed
 *     store locations; it is hidden at every other store in the franchise.
 *
 * Cardinality: many-to-many (a store stocks many products; a restricted product
 * may be offered at several — but not all — stores).
 *
 * Enforced on the storefront read path by filterStoreProductsByFranchise
 * (see src/api/middlewares/filter-products-by-franchise.ts) when a store-location
 * context is present on the request.
 *
 * Generated link table: store_location_product (managed by Medusa's Link Engine)
 */
export default defineLink(
  {
    linkable: FranchiseModule.linkable.storeLocation,
    isList: true,
  },
  {
    linkable: ProductModule.linkable.product,
    isList: true,
  }
)
