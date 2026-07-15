// Import the middleware barrel first so the Medusa framework initialises the
// module/link registry before any defineLink() files below are evaluated
// (mirrors middlewares.unit.spec.ts — without this, defineLink throws
// "Cannot read properties of undefined (reading 'setCustomLink')").
import "../middlewares"
import {
  scopeStoreOrderList,
  guardStoreOrderSingleResource,
} from "../middlewares/scope-store-orders"
import { filterStoreProductsByFranchise } from "../middlewares/filter-products-by-franchise"
const createResponse = () => {
  const res = { status: jest.fn(), json: jest.fn() }
  res.status.mockReturnValue(res)
  return res
}

/**
 * Build a `query.graph` mock for the scoping layers.
 *
 * NOTE: In the unit-test environment the Medusa module loader does not run, so
 * every link's `.entryPoint` is `undefined` — we therefore CANNOT branch on
 * `config.entity` (all link queries would collide on `undefined`). Instead we
 * branch on the distinctive `fields`/`filters` shape of each query:
 *   - user→store    : filters.user_id present
 *   - store→order   : (guard) filters.order_id present ; (list) fields include order_id
 *   - franchise→prod: filters.franchise_id present
 *   - store→product : fields include both product_id and store_location_id
 */
const createGraphMock = (opts: {
  storeLinks?: Array<{ store_location_id?: string }>
  orderLinks?: Array<{ order_id?: string; store_location_id?: string }>
  franchiseProductLinks?: Array<{ product_id?: string }>
  storeProductLinks?: Array<{ product_id?: string; store_location_id?: string }>
  products?: Array<{ id?: string }>
  storeLocations?: Array<{ id?: string }>
}) =>
  jest.fn().mockImplementation((config) => {
    const filters = (config.filters ?? {}) as Record<string, unknown>
    const fields = (config.fields ?? []) as string[]

    if (config.entity === "product") {
      return Promise.resolve({ data: opts.products ?? [] })
    }
    if (config.entity === "store_location") {
      return Promise.resolve({ data: opts.storeLocations ?? [] })
    }
    if ("user_id" in filters) {
      return Promise.resolve({ data: opts.storeLinks ?? [] })
    }
    if ("order_id" in filters) {
      // Single-order guard lookup (order_id + store_location_id filter).
      return Promise.resolve({ data: opts.orderLinks ?? [] })
    }
    if (fields.includes("order_id")) {
      // getOrderIdsForStoreLocations (fields: ["order_id"]).
      return Promise.resolve({ data: opts.orderLinks ?? [] })
    }
    if (fields.includes("product_id") && fields.includes("store_location_id")) {
      return Promise.resolve({ data: opts.storeProductLinks ?? [] })
    }
    if ("franchise_id" in filters) {
      return Promise.resolve({ data: opts.franchiseProductLinks ?? [] })
    }
    return Promise.resolve({ data: [] })
  })

const makeReq = (graph: jest.Mock, overrides: Record<string, unknown> = {}) =>
  ({
    auth_context: { actor_id: "user_1" },
    filterableFields: {},
    params: {},
    headers: {},
    scope: { resolve: jest.fn().mockReturnValue({ graph }) },
    ...overrides,
  }) as any

describe("scopeStoreOrderList (Tier-2 order list scoping)", () => {
  it("passes through untouched when the user has NO store link (franchise-wide)", async () => {
    const graph = createGraphMock({ storeLinks: [] })
    const req = makeReq(graph, { filterableFields: { sales_channel_id: ["sc_1"] } })
    const res = createResponse()
    const next = jest.fn()

    await scopeStoreOrderList(req, res as any, next)

    expect(next).toHaveBeenCalledTimes(1)
    // No `id` allow-list added — franchise scope is the only boundary.
    expect(req.filterableFields.id).toBeUndefined()
    expect(res.json).not.toHaveBeenCalled()
  })

  it("injects an order id allow-list for a store-scoped manager", async () => {
    const graph = createGraphMock({
      storeLinks: [{ store_location_id: "stloc_1" }],
      orderLinks: [{ order_id: "order_1" }, { order_id: "order_2" }],
    })
    const req = makeReq(graph, { filterableFields: { sales_channel_id: ["sc_1"] } })
    const res = createResponse()
    const next = jest.fn()

    await scopeStoreOrderList(req, res as any, next)

    expect(req.filterableFields.id).toEqual(["order_1", "order_2"])
    // Franchise-injected sales_channel_id filter is preserved (AND-ed).
    expect(req.filterableFields.sales_channel_id).toEqual(["sc_1"])
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("short-circuits to an empty page when the manager's branch has no orders", async () => {
    const graph = createGraphMock({
      storeLinks: [{ store_location_id: "stloc_1" }],
      orderLinks: [],
    })
    const req = makeReq(graph)
    const res = createResponse()
    const next = jest.fn()

    await scopeStoreOrderList(req, res as any, next)

    // Must NOT inject an empty id:[] filter (Medusa would ignore it and leak).
    expect(next).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ orders: [], count: 0, offset: 0, limit: 0 })
  })

  it("intersects with an existing id filter so scoping can only tighten", async () => {
    const graph = createGraphMock({
      storeLinks: [{ store_location_id: "stloc_1" }],
      orderLinks: [{ order_id: "order_1" }, { order_id: "order_2" }],
    })
    const req = makeReq(graph, { filterableFields: { id: ["order_2", "order_999"] } })
    const res = createResponse()
    const next = jest.fn()

    await scopeStoreOrderList(req, res as any, next)

    expect(req.filterableFields.id).toEqual(["order_2"])
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe("guardStoreOrderSingleResource (Tier-2 order detail guard)", () => {
  it("passes through when the user has NO store link (franchise-wide)", async () => {
    const graph = createGraphMock({ storeLinks: [] })
    const req = makeReq(graph, { params: { id: "order_1" } })
    const res = createResponse()
    const next = jest.fn()

    await guardStoreOrderSingleResource(req, res as any, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it("allows an order that belongs to the manager's store", async () => {
    const graph = createGraphMock({
      storeLinks: [{ store_location_id: "stloc_1" }],
      orderLinks: [{ store_location_id: "stloc_1" }],
    })
    const req = makeReq(graph, { params: { id: "order_1" } })
    const res = createResponse()
    const next = jest.fn()

    await guardStoreOrderSingleResource(req, res as any, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it("denies (403) an order outside the manager's store", async () => {
    const graph = createGraphMock({
      storeLinks: [{ store_location_id: "stloc_1" }],
      orderLinks: [], // no link between order_1 and stloc_1
    })
    const req = makeReq(graph, { params: { id: "order_1" } })
    const res = createResponse()
    const next = jest.fn()

    await guardStoreOrderSingleResource(req, res as any, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "STORE_ORDER_ACCESS_DENIED" })
    )
    expect(next).not.toHaveBeenCalled()
  })
})

describe("filterStoreProductsByFranchise (Tier-2 per-store availability)", () => {
  const makeStoreReq = (graph: jest.Mock, overrides: Record<string, unknown> = {}) =>
    ({
      franchise_id: "franchise_1",
      filterableFields: {},
      params: {},
      headers: { "x-store-location-id": "stloc_1" },
      scope: { resolve: jest.fn().mockReturnValue({ graph }) },
      ...overrides,
    }) as any

  it("shows shared products (no availability rows) at every store", async () => {
    const graph = createGraphMock({
      franchiseProductLinks: [{ product_id: "prod_shared" }],
      storeProductLinks: [], // no restrictions
    })
    const req = makeStoreReq(graph)
    const res = createResponse()
    const next = jest.fn()

    await filterStoreProductsByFranchise(req, res as any, next)

    expect(req.filterableFields.id).toEqual(["prod_shared"])
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("hides a product restricted to a DIFFERENT store", async () => {
    const graph = createGraphMock({
      franchiseProductLinks: [
        { product_id: "prod_shared" },
        { product_id: "prod_other_store" },
      ],
      // prod_other_store is restricted to stloc_2 only.
      storeProductLinks: [
        { product_id: "prod_other_store", store_location_id: "stloc_2" },
      ],
    })
    const req = makeStoreReq(graph) // current store = stloc_1
    const res = createResponse()
    const next = jest.fn()

    await filterStoreProductsByFranchise(req, res as any, next)

    expect(req.filterableFields.id).toEqual(["prod_shared"])
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("shows a product restricted to THIS store", async () => {
    const graph = createGraphMock({
      franchiseProductLinks: [
        { product_id: "prod_shared" },
        { product_id: "prod_exclusive" },
      ],
      storeProductLinks: [
        { product_id: "prod_exclusive", store_location_id: "stloc_1" },
      ],
    })
    const req = makeStoreReq(graph) // current store = stloc_1
    const res = createResponse()
    const next = jest.fn()

    await filterStoreProductsByFranchise(req, res as any, next)

    expect(req.filterableFields.id).toEqual(["prod_shared", "prod_exclusive"])
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("returns 404 on a detail request for a product restricted away from this store", async () => {
    const graph = createGraphMock({
      franchiseProductLinks: [{ product_id: "prod_other_store" }],
      storeProductLinks: [
        { product_id: "prod_other_store", store_location_id: "stloc_2" },
      ],
    })
    const req = makeStoreReq(graph, { params: { id: "prod_other_store" } })
    const res = createResponse()
    const next = jest.fn()

    await filterStoreProductsByFranchise(req, res as any, next)

    // Thrown MedusaError(NOT_FOUND) is forwarded to next(err).
    expect(next).toHaveBeenCalledTimes(1)
    const forwarded = next.mock.calls[0][0]
    expect(forwarded).toBeInstanceOf(Error)
    expect(String(forwarded.message)).toContain("Product not found")
  })
})
