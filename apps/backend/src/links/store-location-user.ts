import UserModule from "@medusajs/medusa/user"
import { defineLink } from "@medusajs/framework/utils"
import FranchiseModule from "../modules/franchise"

/**
 * User ←→ StoreLocation (Store-scoped admin assignment)
 *
 * Binds an admin user (a branch manager) to one or more physical StoreLocations
 * so their view of orders, inventory, and reservations can be narrowed to just
 * their branch(es) — a finer boundary INSIDE the existing franchise boundary
 * (franchise-user link).
 *
 * Cardinality: many-to-many (isList on the store_location side).
 *   - A manager may cover more than one branch.
 *   - A branch may have more than one manager.
 *
 * Backward-compatibility contract (IMPORTANT):
 *   - A user with NO store-location link is treated as franchise-wide: they see
 *     every store's data within their franchise (the pre-existing behaviour).
 *   - A user WITH one or more store-location links is store-scoped: they see
 *     only the linked branches' data.
 *   This means store scoping is strictly opt-in per user and never tightens
 *     access for existing franchise admins on deploy.
 *
 * Resolution helper: resolveAllowedStoreLocationIds() in utils/tenant-context.ts.
 *
 * Generated link table: user_store_location (managed by Medusa's Link Engine)
 */
export default defineLink(UserModule.linkable.user, {
  linkable: FranchiseModule.linkable.storeLocation,
  isList: true,
})
