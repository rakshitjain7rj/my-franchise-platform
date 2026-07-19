/**
 * Unit tests for CakeFulfillmentProviderService.calculatePrice.
 *
 * Uses a plain-object cradle mock (no Awilix) and injects query.graph fixtures.
 */

const mockQuoteLocalDelivery = jest.fn()

jest.mock("../../../utils/logistics", () => {
  const actual = jest.requireActual("../../../utils/logistics")
  return {
    ...actual,
    quoteLocalDelivery: (...args: unknown[]) => mockQuoteLocalDelivery(...args),
  }
})

import { MedusaError } from "@medusajs/framework/utils"
import CakeFulfillmentProviderService from "../service"
import {
  bindCakeFulfillmentQuery,
  getBoundCakeFulfillmentQuery,
} from "../query-bridge"

const FRANCHISE_SALES_CHANNEL_ENTRY = "franchise_sales_channel"

const STORE = {
  id: "stloc_1",
  franchise_id: "fran_1",
  name: "Cake Break Test",
  latitude: 52.48,
  longitude: -1.9,
  is_active: true,
  is_accepting_orders: true,
  metadata: { delivery_radius_km: 10 },
}

const happyQuote = {
  deliverable: true,
  fee: 5.97,
  distance_km: 4.63,
  duration_minutes: 12,
  max_radius_km: 10,
  source: "haversine" as const,
}

function makeProvider(graphImpl: (args: {
  entity: string
  fields: string[]
  filters?: Record<string, unknown>
}) => Promise<{ data: unknown[] }>) {
  const query = {
    graph: jest.fn(graphImpl),
  }
  const container = { query }
  const provider = new CakeFulfillmentProviderService(container, {})
  return { provider, query }
}

function defaultGraph(overrides?: {
  store?: Record<string, unknown> | null
  cartMeta?: Record<string, unknown> | null
  franchiseId?: string | null
  throwOn?: string
}) {
  return async (args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => {
    if (overrides?.throwOn && args.entity === overrides.throwOn) {
      throw new Error("db down")
    }
    if (args.entity === "store_location") {
      if (overrides?.store === null) return { data: [] }
      return { data: [overrides?.store ?? STORE] }
    }
    if (args.entity === "cart") {
      return {
        data: [
          {
            id: "cart_1",
            metadata: overrides?.cartMeta ?? { store_location_id: "stloc_1" },
          },
        ],
      }
    }
    if (args.entity === FRANCHISE_SALES_CHANNEL_ENTRY) {
      if (overrides?.franchiseId === null) return { data: [] }
      return {
        data: [
          {
            franchise_id: overrides?.franchiseId ?? "fran_1",
            sales_channel_id: "sc_1",
          },
        ],
      }
    }
    return { data: [] }
  }
}

const baseContext = {
  id: "cart_1",
  sales_channel_id: "sc_1",
  shipping_address: { postal_code: "B1 1AA" },
  items: [],
} as any

const deliveryOption = { id: "cake-local-delivery" }
const pickupOption = { id: "cake-pickup" }

describe("CakeFulfillmentProviderService.calculatePrice", () => {
  beforeEach(() => {
    mockQuoteLocalDelivery.mockReset()
    mockQuoteLocalDelivery.mockResolvedValue(happyQuote)
  })

  it("returns zero for pickup", async () => {
    const { provider } = makeProvider(defaultGraph())
    const price = await provider.calculatePrice(pickupOption, {}, baseContext)
    expect(price).toEqual({
      calculated_amount: 0,
      is_calculated_price_tax_inclusive: true,
    })
    expect(mockQuoteLocalDelivery).not.toHaveBeenCalled()
  })

  it("calculates local delivery fee via canonical quote", async () => {
    const { provider } = makeProvider(defaultGraph())
    const price = await provider.calculatePrice(
      deliveryOption,
      { store_location_id: "stloc_1" },
      baseContext
    )
    expect(price.calculated_amount).toBe(5.97)
    expect(mockQuoteLocalDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        postcode: "B1 1AA",
        store: expect.objectContaining({ id: "stloc_1" }),
      })
    )
  })

  it("rejects missing store selection", async () => {
    const { provider } = makeProvider(defaultGraph({ cartMeta: {} }))
    await expect(
      provider.calculatePrice(deliveryOption, {}, baseContext)
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: expect.stringMatching(/store_location_id/i),
    })
  })

  it("rejects missing postcode", async () => {
    const { provider } = makeProvider(defaultGraph())
    await expect(
      provider.calculatePrice(
        deliveryOption,
        { store_location_id: "stloc_1" },
        {
          ...baseContext,
          shipping_address: {},
        }
      )
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: expect.stringMatching(/postcode/i),
    })
  })

  it("rejects inactive store", async () => {
    const { provider } = makeProvider(
      defaultGraph({ store: { ...STORE, is_active: false } })
    )
    await expect(
      provider.calculatePrice(
        deliveryOption,
        { store_location_id: "stloc_1" },
        baseContext
      )
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: expect.stringMatching(/not currently available/i),
    })
  })

  it("rejects store that is not accepting orders", async () => {
    const { provider } = makeProvider(
      defaultGraph({ store: { ...STORE, is_accepting_orders: false } })
    )
    await expect(
      provider.calculatePrice(
        deliveryOption,
        { store_location_id: "stloc_1" },
        baseContext
      )
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: expect.stringMatching(/not accepting orders/i),
    })
  })

  it("rejects client store hint that mismatches cart metadata", async () => {
    const { provider } = makeProvider(
      defaultGraph({ cartMeta: { store_location_id: "stloc_1" } })
    )
    await expect(
      provider.calculatePrice(
        deliveryOption,
        { store_location_id: "stloc_OTHER" },
        baseContext
      )
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: expect.stringMatching(/does not match/i),
    })
  })

  it("rejects cross-franchise store selection", async () => {
    const { provider } = makeProvider(
      defaultGraph({
        store: { ...STORE, franchise_id: "fran_OTHER" },
        franchiseId: "fran_1",
      })
    )
    await expect(
      provider.calculatePrice(
        deliveryOption,
        { store_location_id: "stloc_1" },
        baseContext
      )
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: expect.stringMatching(/does not belong to this cart's franchise/i),
    })
  })

  it("rejects when store is not found", async () => {
    const { provider } = makeProvider(defaultGraph({ store: null }))
    await expect(
      provider.calculatePrice(
        deliveryOption,
        { store_location_id: "stloc_1" },
        baseContext
      )
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: expect.stringMatching(/not found/i),
    })
  })

  it("rejects conflicting line-item store ids", async () => {
    const { provider } = makeProvider(defaultGraph({ cartMeta: {} }))
    await expect(
      provider.calculatePrice(deliveryOption, {}, {
        ...baseContext,
        items: [
          { metadata: { store_location_id: "stloc_a" } },
          { metadata: { store_location_id: "stloc_b" } },
        ],
      })
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: expect.stringMatching(/multiple bakeries/i),
    })
  })

  it("maps outside-radius quote to INVALID_DATA", async () => {
    mockQuoteLocalDelivery.mockResolvedValue({
      deliverable: false,
      fee: 0,
      distance_km: 12,
      duration_minutes: 20,
      max_radius_km: 10,
      source: "haversine",
      error: "outside_radius",
      message:
        "Sorry — this address is outside the 10 km delivery radius for Cake Break Test.",
    })
    const { provider } = makeProvider(defaultGraph())
    await expect(
      provider.calculatePrice(
        deliveryOption,
        { store_location_id: "stloc_1" },
        baseContext
      )
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: expect.stringMatching(/outside the 10 km/i),
    })
  })

  it("maps missing store coordinates from quote", async () => {
    mockQuoteLocalDelivery.mockResolvedValue({
      deliverable: false,
      fee: 0,
      distance_km: null,
      duration_minutes: null,
      max_radius_km: 10,
      source: null,
      error: "missing_coords",
      message: "This bakery has no map coordinates configured for delivery.",
    })
    const { provider } = makeProvider(defaultGraph())
    await expect(
      provider.calculatePrice(
        deliveryOption,
        { store_location_id: "stloc_1" },
        baseContext
      )
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: expect.stringMatching(/coordinates/i),
    })
  })

  it("maps unresolvable postcode from quote", async () => {
    mockQuoteLocalDelivery.mockResolvedValue({
      deliverable: false,
      fee: 0,
      distance_km: null,
      duration_minutes: null,
      max_radius_km: 10,
      source: null,
      error: "unresolvable_postcode",
      message: "Could not resolve that postcode.",
    })
    const { provider } = makeProvider(defaultGraph())
    await expect(
      provider.calculatePrice(
        deliveryOption,
        { store_location_id: "stloc_1" },
        baseContext
      )
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: expect.stringMatching(/postcode/i),
    })
  })

  it("returns controlled UNEXPECTED_STATE when query and fallbacks are missing", async () => {
    const provider = new CakeFulfillmentProviderService({}, {})
    await expect(
      provider.calculatePrice(
        deliveryOption,
        { store_location_id: "stloc_1" },
        baseContext
      )
    ).rejects.toMatchObject({
      type: MedusaError.Types.UNEXPECTED_STATE,
      message: expect.stringMatching(
        /query service missing|store lookup failed/i
      ),
    })
  })

  it("loads store via franchise module when query is missing", async () => {
    mockQuoteLocalDelivery.mockResolvedValue(happyQuote)
    const listStoreLocations = jest.fn(async () => [STORE])
    const provider = new CakeFulfillmentProviderService(
      {
        franchise: { listStoreLocations },
        // cart meta via client hint path — no cart service needed when hint matches
      },
      {}
    )
    // Without cart service, resolveStoreLocationId uses shipping-method data
    // hint after cart meta fails; then franchise ownership still needs SC link.
    // Provide raw pg for franchise-sc link only.
    const pg = {
      raw: jest.fn(async (sql: string) => {
        if (String(sql).includes("franchise_franchise_sales_channel")) {
          return { rows: [{ franchise_id: "fran_1" }] }
        }
        return { rows: [] }
      }),
    }
    const provider2 = new CakeFulfillmentProviderService(
      {
        franchise: { listStoreLocations },
        __pg_connection__: pg,
      },
      {}
    )
    const price = await provider2.calculatePrice(
      deliveryOption,
      { store_location_id: "stloc_1" },
      baseContext
    )
    expect(price.calculated_amount).toBe(5.97)
    expect(listStoreLocations).toHaveBeenCalled()
  })

  it("returns controlled UNEXPECTED_STATE when store lookup throws", async () => {
    const { provider } = makeProvider(
      defaultGraph({ throwOn: "store_location" })
    )
    await expect(
      provider.calculatePrice(
        deliveryOption,
        { store_location_id: "stloc_1" },
        baseContext
      )
    ).rejects.toMatchObject({
      type: MedusaError.Types.UNEXPECTED_STATE,
      message: expect.stringMatching(/store lookup failed/i),
    })
  })

  it("does not call container.resolve (Awilix cradle safety)", async () => {
    const resolve = jest.fn(() => {
      throw new Error("Could not resolve 'resolve'")
    })
    const query = {
      graph: jest.fn(defaultGraph()),
    }
    const container = {
      query,
      get resolve() {
        return resolve
      },
    }
    const provider = new CakeFulfillmentProviderService(container, {})
    const price = await provider.calculatePrice(
      deliveryOption,
      { store_location_id: "stloc_1" },
      baseContext
    )
    expect(price.calculated_amount).toBe(5.97)
    expect(resolve).not.toHaveBeenCalled()
  })
})
