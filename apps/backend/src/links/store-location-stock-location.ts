import { defineLink } from "@medusajs/framework/utils"
import FranchiseModule from "../modules/franchise"
import StockLocationModule from "@medusajs/medusa/stock-location"

/**
 * StoreLocation ←→ StockLocation (Tier 2: Fulfillment Boundary Link)
 *
 * This link table implements the "Store-Level Isolation" tier of the
 * Two-Tier State Isolation architecture.
 *
 * Semantics:
 *   - Each physical StoreLocation is mapped 1-to-1 with a Medusa StockLocation.
 *   - Medusa's inventory engine uses StockLocation to track on-hand quantity,
 *     reservations, and fulfillment provider assignments natively.
 *   - By linking StoreLocation → StockLocation, the platform can:
 *       1. Resolve per-branch stock levels during cart validation.
 *       2. Hard-lock order fulfilment to the store the customer selected.
 *       3. Route low-stock alerts to the correct branch manager.
 *
 * Generated link table: store_location_stock_location (managed by Medusa's Link Engine)
 * Queryable via:
 *   remoteQuery({
 *     store_location: {
 *       stock_location: { fields: ["id", "name", "address"] }
 *     }
 *   })
 *
 * NOTE: The raw `stock_location_id` text column that previously existed on the
 * StoreLocation DML model has been removed. All cross-module references must
 * go through this Link table to enable Medusa's remote query join engine.
 */
export default defineLink(
  FranchiseModule.linkable.storeLocation,
  StockLocationModule.linkable.stockLocation
)
