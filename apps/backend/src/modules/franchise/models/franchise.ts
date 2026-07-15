import { model } from "@medusajs/framework/utils"
import StoreLocation from "./store_location"

/**
 * Franchise — the top-level brand entity in the multi-tenant network.
 *
 * A Franchise is an abstract brand boundary, NOT a physical location.
 * All geo-data (latitude, longitude, address) lives on StoreLocation.
 *
 * Medusa Link relationships:
 *   - franchise  ←→  SalesChannel   (via src/links/franchise-sales-channel.ts)
 *   - franchise  ←→  Store          (via src/links/franchise-store.ts)
 */
const Franchise = model.define("franchise", {
  /**
   * Surrogate primary key with "fran_" prefix for easy log tracing.
   * Example: fran_01J9Z2K3T4P5Q6R7S8U9V0W1X2
   */
  id: model.id({ prefix: "fran" }).primaryKey(),

  /** Public-facing brand name shown in the storefront header. */
  name: model.text(),

  /**
   * Short, machine-readable brand identifier used as the tenant slug
   * in API routing (e.g. "amr", "cakebreak").
   * Must be unique across the network.
   */
  code: model.text().unique(),

  /**
   * Master kill-switch for the franchise.
   * When false, all store_locations under this franchise become
   * unreachable to the storefront router regardless of their own is_active flag.
   * Defaults to true so new franchises are live-ready after seeding.
   */
  is_active: model.boolean().default(true),

  /**
   * One franchise can operate multiple physical bakery branches.
   * Resolved lazily by Medusa's DML engine — standard top-level import is safe.
   */
  store_locations: model.hasMany(() => StoreLocation, {
    mappedBy: "franchise",
  }),

  /**
   * Generic JSON extension bag.
   * Recommended keys:
   *   - `brand_color`: string — primary hex for the franchise storefront theme.
   *   - `logo_url`: string — CDN URL of the franchise logo asset.
   *   - `contact_email`: string — franchise operations contact.
   */
  metadata: model.json().nullable(),
})

export default Franchise