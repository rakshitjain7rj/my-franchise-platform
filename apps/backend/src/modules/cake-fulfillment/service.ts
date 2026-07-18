/**
 * Cake Break fulfillment provider.
 *
 * - `cake-pickup`          : free collection (canCalculate = false; use flat £0 option)
 * - `cake-local-delivery`  : calculated local delivery — price is recomputed from
 *   store coords + shipping postcode via quoteLocalDelivery (same policy as
 *   GET /store/stores/:id/delivery-fee). Never trusts client-set metadata.fee.
 *
 * Registered as provider id `cake_cake` (module id "cake" + service identifier).
 *
 * DI note: Medusa registers fulfillment providers with an Awilix *cradle*
 * (PROXY injection). Property access (this.container_.query) works;
 * this.container_.resolve("…") does not — Awilix looks up a registration
 * literally named "resolve" and throws AwilixResolutionError.
 *
 * Prefer lazy property access for `query` (do not capture in the constructor):
 * QUERY is initially registered as undefined and re-bound after modules load.
 */

import {
  AbstractFulfillmentProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateShippingOptionDTO,
} from "@medusajs/framework/types"
import { quoteLocalDelivery } from "../../utils/logistics"

/**
 * Query entry point for `apps/backend/src/links/franchise-sales-channel.ts`.
 * Hard-coded to avoid importing defineLink at provider load time (Awilix
 * singleton construction can run outside full MedusaModule bootstrap in tests).
 * Keep in sync with FranchiseSalesChannelLink.entryPoint.
 */
const FRANCHISE_SALES_CHANNEL_ENTRY = "franchise_sales_channel"

type GraphQuery = {
  graph: (args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => Promise<{ data: unknown[] }>
}

type StoreLocationRow = {
  id: string
  franchise_id: string
  latitude: number | null
  longitude: number | null
  name: string
  is_active?: boolean
  is_accepting_orders?: boolean
  metadata: Record<string, unknown> | null
}

class CakeFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "cake"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected container_: any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(container: any, _options: Record<string, unknown> = {}) {
    super()
    this.container_ = container
  }

  async getFulfillmentOptions() {
    return [
      { id: "cake-pickup" },
      { id: "cake-local-delivery" },
    ]
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    return (
      data?.id === "cake-pickup" || data?.id === "cake-local-delivery"
    )
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _context: any
  ): Promise<Record<string, unknown>> {
    return { ...data, option_id: optionData?.id }
  }

  async canCalculate(data: CreateShippingOptionDTO): Promise<boolean> {
    // Shipping option `data` is what createShippingOptions stored (see setup-uk-market).
    const optionData = (data as { data?: Record<string, unknown> })?.data
    const id = optionData?.id ?? (data as { id?: string }).id
    return id === "cake-local-delivery"
  }

  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const optionId = (optionData as Record<string, unknown>)?.id
    if (optionId === "cake-pickup") {
      return {
        calculated_amount: 0,
        is_calculated_price_tax_inclusive: true,
      }
    }

    const storeId = await this.resolveStoreLocationId(context, data)
    const postcode = this.resolveDeliveryPostcode(context)

    if (!storeId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Delivery pricing requires a selected bakery (store_location_id on the cart)."
      )
    }
    if (!postcode) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Delivery pricing requires a postcode on the shipping address."
      )
    }

    const location = await this.loadStoreLocation(storeId)
    if (!location) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Selected bakery was not found for delivery pricing."
      )
    }

    if (location.is_active === false) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "This bakery is not currently available for delivery."
      )
    }

    if (location.is_accepting_orders === false) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "This bakery is not accepting orders right now."
      )
    }

    await this.assertStoreBelongsToCartFranchise(context, location)

    const quote = await quoteLocalDelivery({
      store: location,
      postcode,
    })

    if (quote.error === "missing_coords") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        quote.message ??
          "This bakery has no map coordinates configured for delivery."
      )
    }
    if (
      quote.error === "unresolvable_postcode" ||
      quote.error === "missing_destination"
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Could not resolve that postcode for delivery pricing."
      )
    }
    if (!quote.deliverable || quote.error === "outside_radius") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        quote.message ??
          `Address is outside the delivery radius for ${location.name}.`
      )
    }

    return {
      calculated_amount: quote.fee,
      is_calculated_price_tax_inclusive: true,
    }
  }

  /**
   * Lazy cradle property access — never call container.resolve().
   */
  private getQuery(): GraphQuery {
    const c = this.container_
    let query: GraphQuery | undefined
    try {
      query = c?.query as GraphQuery | undefined
    } catch {
      query = undefined
    }
    if (!query || typeof query.graph !== "function") {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Delivery pricing is temporarily unavailable (query service missing)."
      )
    }
    return query
  }

  private async loadStoreLocation(
    storeId: string
  ): Promise<StoreLocationRow | null> {
    try {
      const query = this.getQuery()
      const { data } = await query.graph({
        entity: "store_location",
        fields: [
          "id",
          "franchise_id",
          "latitude",
          "longitude",
          "name",
          "is_active",
          "is_accepting_orders",
          "metadata",
        ],
        filters: { id: storeId },
      })
      const row = (data?.[0] ?? null) as StoreLocationRow | null
      if (!row) return null
      return {
        id: String(row.id),
        franchise_id: String(row.franchise_id ?? ""),
        latitude:
          row.latitude == null || (row.latitude as unknown) === ""
            ? null
            : Number(row.latitude),
        longitude:
          row.longitude == null || (row.longitude as unknown) === ""
            ? null
            : Number(row.longitude),
        name: String(row.name ?? ""),
        is_active: row.is_active,
        is_accepting_orders: row.is_accepting_orders,
        metadata:
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : null,
      }
    } catch (err) {
      if (err instanceof MedusaError) throw err
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Delivery pricing is temporarily unavailable (store lookup failed)."
      )
    }
  }

  private async loadCartMetadata(
    cartId: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const query = this.getQuery()
      const { data } = await query.graph({
        entity: "cart",
        fields: ["id", "metadata"],
        filters: { id: cartId },
      })
      const row = data?.[0] as { metadata?: unknown } | undefined
      if (row?.metadata && typeof row.metadata === "object") {
        return row.metadata as Record<string, unknown>
      }
    } catch (err) {
      if (err instanceof MedusaError) throw err
      // Fall through — store may still be resolved from the client hint.
    }
    return null
  }

  /**
   * Resolve franchise_id for the cart's sales_channel_id via the
   * franchise-sales-channel link (Tier-1 source of truth).
   */
  private async resolveFranchiseIdForSalesChannel(
    salesChannelId: string
  ): Promise<string | null> {
    try {
      const query = this.getQuery()
      const { data } = await query.graph({
        entity: FRANCHISE_SALES_CHANNEL_ENTRY,
        fields: ["franchise_id", "sales_channel_id"],
        filters: { sales_channel_id: salesChannelId },
      })
      const row = data?.[0] as { franchise_id?: string } | undefined
      const franchiseId = row?.franchise_id
      return typeof franchiseId === "string" && franchiseId.trim()
        ? franchiseId.trim()
        : null
    } catch (err) {
      if (err instanceof MedusaError) throw err
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Delivery pricing is temporarily unavailable (tenant lookup failed)."
      )
    }
  }

  /**
   * cart.sales_channel_id is set at cart creation from the franchise header
   * via franchiseTenantMiddleware → franchise-sales-channel link. It is the
   * server-side tenant anchor for this charge path (not the client header).
   */
  private async assertStoreBelongsToCartFranchise(
    context: CalculateShippingOptionPriceDTO["context"],
    location: StoreLocationRow
  ): Promise<void> {
    const salesChannelRaw = (context as { sales_channel_id?: unknown })
      .sales_channel_id
    const salesChannelId =
      typeof salesChannelRaw === "string" ? salesChannelRaw.trim() : ""

    if (!salesChannelId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Delivery pricing requires a sales channel on the cart."
      )
    }

    const franchiseId =
      await this.resolveFranchiseIdForSalesChannel(salesChannelId)
    if (!franchiseId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Could not resolve franchise for this cart's sales channel."
      )
    }

    if (!location.franchise_id || location.franchise_id !== franchiseId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Selected bakery does not belong to this cart's franchise."
      )
    }
  }

  /**
   * Canonical store selection:
   *  1. cart.metadata.store_location_id (loaded server-side by cart id)
   *  2. shipping-method data.store_location_id — consistency-checked hint only
   *  3. unanimous line-item metadata (conflicting ids → reject)
   *
   * Client-controlled values are accepted as selection inputs only after
   * franchise ownership is verified in assertStoreBelongsToCartFranchise.
   */
  private async resolveStoreLocationId(
    context: CalculateShippingOptionPriceDTO["context"],
    data: CalculateShippingOptionPriceDTO["data"]
  ): Promise<string | null> {
    const hintFromData =
      data &&
      typeof (data as Record<string, unknown>).store_location_id === "string"
        ? String((data as Record<string, unknown>).store_location_id).trim()
        : ""

    const cartId =
      typeof (context as { id?: unknown }).id === "string"
        ? (context as { id: string }).id
        : null

    let fromCartMeta = ""
    if (cartId) {
      const cartMeta = await this.loadCartMetadata(cartId)
      if (
        typeof cartMeta?.store_location_id === "string" &&
        cartMeta.store_location_id.trim()
      ) {
        fromCartMeta = cartMeta.store_location_id.trim()
      }
    }

    if (fromCartMeta) {
      if (hintFromData && hintFromData !== fromCartMeta) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Shipping method store does not match the bakery selected on the cart."
        )
      }
      return fromCartMeta
    }

    const lineIds = new Set<string>()
    const items =
      (
        context as {
          items?: Array<{ metadata?: Record<string, unknown> | null }>
        }
      )?.items ?? []
    for (const item of items) {
      const id = item?.metadata?.store_location_id
      if (typeof id === "string" && id.trim()) {
        lineIds.add(id.trim())
      }
    }
    if (lineIds.size > 1) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Cart contains items for multiple bakeries. Delivery requires a single store."
      )
    }
    const fromLines = lineIds.size === 1 ? [...lineIds][0] : ""

    if (fromLines) {
      if (hintFromData && hintFromData !== fromLines) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Shipping method store does not match the bakery on cart line items."
        )
      }
      return fromLines
    }

    // Last resort: client shipping-method data (still tenant-checked later).
    return hintFromData || null
  }

  private resolveDeliveryPostcode(
    context: CalculateShippingOptionPriceDTO["context"]
  ): string {
    const fromAddress = context.shipping_address?.postal_code?.trim()
    if (fromAddress) return fromAddress
    return ""
  }

  async createFulfillment() {
    return { data: {}, labels: [] }
  }

  async cancelFulfillment() {
    return {}
  }

  async createReturnFulfillment() {
    return { data: {}, labels: [] }
  }
}

export default CakeFulfillmentProviderService
