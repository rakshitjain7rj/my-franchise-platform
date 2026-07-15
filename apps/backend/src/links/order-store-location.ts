import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import FranchiseModule from "../modules/franchise"

/**
 * StoreLocation ←→ Order (Tier 2: Fulfillment Boundary Link)
 *
 * Binds every placed order to the physical StoreLocation the customer selected
 * at cart time. Previously this association lived only inside the unindexed
 * `order.metadata.store_location_id` JSON blob, which could not be used as a
 * queryable filter for admin scoping.
 *
 * Cardinality (one-to-many, mirroring franchise-product):
 *   - One StoreLocation owns many Orders (isList on the order side).
 *   - Every Order belongs to exactly ONE StoreLocation.
 *
 * The link is populated by the `order.placed` subscriber
 * (see src/subscribers/link-order-to-store-location.ts), which reads the
 * store_location_id off the order's metadata (copied from the completing cart).
 *
 * This does NOT replace the franchise-level order scope (order → sales_channel
 * → store → franchise). It layers a finer store boundary INSIDE the franchise
 * boundary: store-scoped admins (branch managers) are restricted to orders whose
 * link points at one of their assigned StoreLocations
 * (see src/api/middlewares/scope-store-orders.ts).
 *
 * Generated link table: store_location_order (managed by Medusa's Link Engine)
 * Queryable via:
 *   query.graph({ entity: OrderStoreLocationLink.entryPoint,
 *                 fields: ["order_id", "store_location_id"], filters: {...} })
 */
export default defineLink(FranchiseModule.linkable.storeLocation, {
  linkable: OrderModule.linkable.order,
  isList: true,
})
