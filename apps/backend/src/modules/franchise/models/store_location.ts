import { model } from "@medusajs/framework/utils"
import Franchise from "./franchise"

/**
 * StoreLocation — a physical bakery branch belonging to a Franchise.
 *
 * Tier 2 of the Two-Tier State Isolation model: the Fulfillment Boundary.
 * Each store handles its own order queue, inventory slot, pickup windows,
 * and Stripe payout split.
 *
 * Medusa Link relationships:
 *   - store_location  ←→  StockLocation   (via src/links/store-location-stock-location.ts)
 *
 * The `stock_location_id` raw column has been intentionally removed in favour
 * of the proper Medusa Link table, which enables remote query joins.
 */
const StoreLocation = model.define("store_location", {
  /**
   * Surrogate primary key with "stloc_" prefix.
   * Example: stloc_01J9Z2K3T4P5Q6R7S8U9V0W1X2
   */
  id: model.id({ prefix: "stloc" }).primaryKey(),

  /** Human-readable location name. e.g. "Cake Break – Koramangala" */
  name: model.text(),

  /**
   * Short, machine-readable location code used in fulfilment routing.
   * Convention: <FRANCHISE_CODE>-<CITY_SHORT>, e.g. "AMR-KOR", "CB-BTM".
   */
  code: model.text(),

  /** Street address displayed in cart, checkout confirmation, and map sidebar. */
  address: model.text().nullable(),

  /** WGS-84 latitude for map pin display and geo-radius queries. */
  latitude: model.float().nullable(),

  /** WGS-84 longitude for map pin display and geo-radius queries. */
  longitude: model.float().nullable(),

  // ──────────────────────────────────────────────────────────────────────────
  // OPERATIONAL STATE — promoted from metadata bag to native indexed columns.
  // PostgreSQL can now build partial indexes on these for storefront map routing.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Master on/off switch for the location.
   * When false, the location is hidden from the storefront map and cannot
   * receive new orders. Defaults to true so freshly seeded branches are live.
   */
  is_active: model.boolean().default(true),

  /**
   * Real-time order-acceptance gate.
   * Distinct from is_active: a location can be active (visible on the map)
   * but temporarily not accepting orders (e.g. during a rush or holiday).
   * Storefront map routing queries filter on:
   *   WHERE is_active = true AND is_accepting_orders = true
   * Defaults to true — operators must explicitly close the window.
   */
  is_accepting_orders: model.boolean().default(true),

  /**
   * Franchise-wide default store for first-time storefront visitors.
   *
   * When true, new shoppers who have not yet chosen a bakery get this
   * location pre-selected (cookie bootstrap). At most one location per
   * franchise should be default — the admin PATCH handlers enforce that
   * by clearing the flag on sibling locations when this is set to true.
   *
   * Defaults to false so existing locations stay non-default until an
   * operator explicitly promotes one.
   */
  is_default: model.boolean().default(false),

  /**
   * Minimum advance booking window in hours for custom / made-to-order cakes.
   * Overrides the franchise-level default on a per-location basis.
   * Example: 24 means orders must be placed at least 24 hours before pickup.
   * Indexed candidate for storefront filter: WHERE custom_lead_time_hours <= :requested_hours
   */
  custom_lead_time_hours: model.number().default(24),

  // ──────────────────────────────────────────────────────────────────────────
  // CAPACITY & SCHEDULING
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Operating hours encoded as a JSON object keyed by lowercase weekday:
   * { monday: { open: "09:00", close: "20:00" }, tuesday: { … }, … }
   * Days absent from the object are treated as closed.
   */
  opening_hours: model.json().nullable(),

  /**
   * Maximum orders bookable per 30-minute pickup slot.
   * Used by the time-slot availability calculation to prevent over-booking.
   */
  daily_order_capacity: model.number().default(10),

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 5 PLACEHOLDER — Stripe Connect
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Stripe Connect account ID for per-location payout splits.
   * Populated during Phase 5 onboarding flow; null until then.
   * Example: "acct_1A2B3C4D5E6F7G8H"
   *
   * NEVER expose this column in public-facing API responses.
   * Access must be gated behind admin-only middleware.
   */
  stripe_connect_account_id: model.text().nullable(),

  // ──────────────────────────────────────────────────────────────────────────
  // RELATIONSHIPS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Parent franchise brand.
   * Medusa DML evaluates the arrow function lazily; top-level ES import is safe.
   */
  franchise: model.belongsTo(() => Franchise, {
    mappedBy: "store_locations",
  }),

  /**
   * Extension metadata bag for non-queryable store-specific data.
   * Recommended keys:
   *   - `delivery_radius_km`: number — radius used for local delivery filtering.
   *   - `manager_name`: string — branch manager contact for ops notifications.
   *   - `instagram_handle`: string — location-specific social profile.
   */
  metadata: model.json().nullable(),
})

export default StoreLocation
