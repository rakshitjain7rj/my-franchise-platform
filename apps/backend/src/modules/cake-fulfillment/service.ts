/**
 * Cake Break fulfillment provider.
 *
 * - `cake-pickup`          : free collection (canCalculate = false; use flat £0 option)
 * - `cake-local-delivery`  : calculated local delivery — price is recomputed from
 *   store coords + shipping postcode using the same maths as
 *   GET /store/stores/:id/delivery-fee. Never trusts client-set metadata.fee alone.
 *
 * Registered as provider id `cake_cake` (module id "cake" + service identifier).
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
import {
  DEFAULT_DELIVERY_FEE_CONFIG,
  cacheGet,
  cacheSet,
  computeDeliveryFee,
  haversineKm,
} from "../../utils/logistics"

const CACHE_TTL_MS = 15 * 60 * 1000

type GeoPoint = { lat: number; lng: number }

async function geocodeUkPostcode(postcode: string): Promise<GeoPoint | null> {
  const key = `geo:pc:${postcode.toUpperCase().replace(/\s+/g, "")}`
  const cached = cacheGet<GeoPoint>(key)
  if (cached) return cached

  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const json = (await res.json()) as {
      result?: { latitude?: number; longitude?: number }
    }
    if (json.result?.latitude == null || json.result?.longitude == null) {
      return null
    }
    const point = {
      lat: Number(json.result.latitude),
      lng: Number(json.result.longitude),
    }
    cacheSet(key, point, CACHE_TTL_MS)
    return point
  } catch {
    return null
  }
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

    // Medusa's cartFieldsForCalculateShippingOptionsPrices does NOT include
    // cart.metadata, so context.metadata is usually empty even when the cart
    // row has store_location_id. Resolve bakery id from every reliable source.
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

    const franchiseService = this.container_.resolve("franchise") as {
      listStoreLocations: (
        filters?: Record<string, unknown>,
        config?: Record<string, unknown>
      ) => Promise<
        Array<{
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          metadata: Record<string, unknown> | null
        }>
      >
    }

    const [location] = await franchiseService.listStoreLocations(
      { id: storeId },
      {
        select: ["id", "latitude", "longitude", "name", "metadata"],
      }
    )

    if (!location || location.latitude == null || location.longitude == null) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "This bakery has no map coordinates configured for delivery."
      )
    }

    const dest = await geocodeUkPostcode(postcode)
    if (!dest) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Could not resolve that postcode for delivery pricing."
      )
    }

    const cfg = DEFAULT_DELIVERY_FEE_CONFIG
    const radiusKm =
      Number(location.metadata?.delivery_radius_km) || cfg.defaultRadiusKm
    const distanceKm =
      haversineKm(
        Number(location.latitude),
        Number(location.longitude),
        dest.lat,
        dest.lng
      ) * cfg.roadFactor

    if (distanceKm > radiusKm) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Address is outside the ${radiusKm} km delivery radius for ${location.name}.`
      )
    }

    const fee = computeDeliveryFee(distanceKm, cfg)

    return {
      calculated_amount: fee,
      is_calculated_price_tax_inclusive: true,
    }
  }

  /**
   * Resolve the Cake Break store location used for delivery pricing.
   *
   * Priority:
   *  1. shipping-method `data.store_location_id` (passed by storefront)
   *  2. `context.metadata.store_location_id` (only if Medusa included metadata)
   *  3. line-item metadata (items.* is always in the pricing field set)
   *  4. cart.metadata loaded by cart id (authoritative fallback)
   */
  private async resolveStoreLocationId(
    context: CalculateShippingOptionPriceDTO["context"],
    data: CalculateShippingOptionPriceDTO["data"]
  ): Promise<string | null> {
    const fromData =
      data && typeof (data as Record<string, unknown>).store_location_id === "string"
        ? String((data as Record<string, unknown>).store_location_id).trim()
        : ""
    if (fromData) return fromData

    const meta =
      (context as { metadata?: Record<string, unknown> | null })?.metadata ?? null
    if (typeof meta?.store_location_id === "string" && meta.store_location_id.trim()) {
      return meta.store_location_id.trim()
    }

    const items =
      (context as { items?: Array<{ metadata?: Record<string, unknown> | null }> })
        ?.items ?? []
    for (const item of items) {
      const id = item?.metadata?.store_location_id
      if (typeof id === "string" && id.trim()) return id.trim()
    }

    const cartId =
      typeof (context as { id?: unknown }).id === "string"
        ? (context as { id: string }).id
        : null
    if (!cartId) return null

    try {
      const query = this.container_.resolve("query") as {
        graph: (args: {
          entity: string
          fields: string[]
          filters?: Record<string, unknown>
        }) => Promise<{ data: Array<{ metadata?: Record<string, unknown> | null }> }>
      }
      const { data: carts } = await query.graph({
        entity: "cart",
        fields: ["id", "metadata"],
        filters: { id: cartId },
      })
      const cartMeta = carts?.[0]?.metadata
      if (
        typeof cartMeta?.store_location_id === "string" &&
        cartMeta.store_location_id.trim()
      ) {
        return cartMeta.store_location_id.trim()
      }
    } catch {
      // Fall through — caller surfaces a clear invalid_data error.
    }

    return null
  }

  private resolveDeliveryPostcode(
    context: CalculateShippingOptionPriceDTO["context"]
  ): string {
    const fromAddress = context.shipping_address?.postal_code?.trim()
    if (fromAddress) return fromAddress

    const meta =
      (context as { metadata?: Record<string, unknown> | null })?.metadata ?? null
    if (typeof meta?.delivery_postcode === "string") {
      return meta.delivery_postcode.trim()
    }

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
