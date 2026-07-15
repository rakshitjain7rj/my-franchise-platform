import { defineLink } from "@medusajs/framework/utils"
import FranchiseModule from "../modules/franchise"
import SalesChannelModule from "@medusajs/medusa/sales-channel"

/**
 * Franchise ←→ SalesChannel (Tier 1: Brand Boundary Link)
 *
 * This link table implements the "Franchise-Level Isolation" tier of the
 * Two-Tier State Isolation architecture.
 *
 * Semantics:
 *   - One Franchise maps to one or more SalesChannels (isList: true).
 *   - Products and Variants are scoped to a SalesChannel, which Medusa
 *     enforces natively at the catalogue and cart-line level.
 *   - By linking Franchise → SalesChannel, the storefront can resolve
 *     "which products belong to franchise X?" via a single remote query.
 *
 * Generated link table: franchise_sales_channel (managed by Medusa's Link Engine)
 * Queryable via: remoteQuery({ franchise: { sales_channels: { fields: [...] } } })
 */
export default defineLink(
  FranchiseModule.linkable.franchise,
  {
    linkable: SalesChannelModule.linkable.salesChannel,
    /**
     * isList: true — a single franchise may operate multiple sales channels
     * (e.g. one per geographic region or channel-type: web, in-store kiosk).
     * Remove this flag to enforce a strict 1-to-1 constraint.
     */
    isList: true,
  }
)
