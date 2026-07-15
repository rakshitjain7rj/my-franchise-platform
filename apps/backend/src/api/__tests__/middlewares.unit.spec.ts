import { franchiseTenantMiddleware } from "../middlewares"
import { filterStoreProductsByFranchise } from "../middlewares/filter-products-by-franchise"
import FranchiseStoreLink from "../../links/franchise-store"
import FranchiseProductLink from "../../links/franchise-product"

const createResponse = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  }

  res.status.mockReturnValue(res)

  return res
}

const createNext = () => jest.fn().mockImplementation((err) => {
  if (err) console.error("NEXT ERROR DETECTED:", err)
})


describe("franchise tenant middleware", () => {
  it("rejects store requests without a franchise header", async () => {
    const req = {
      headers: {},
      path: "/store/products",
    } as any
    const res = createResponse()
    const next = createNext()

    await franchiseTenantMiddleware(req, res as any, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      message: "Missing required header: x-franchise-id",
      code: "MISSING_FRANCHISE_ID",
    })
    expect(next).not.toHaveBeenCalled()
  })

  it("adds the franchise context from the request header", async () => {
    const req = {
      headers: {
        "x-franchise-id": " franchise_123 ",
      },
      path: "/store/products",
    } as any
    const res = createResponse()
    const next = createNext()

    await franchiseTenantMiddleware(req, res as any, next)

    expect(req.franchise_id).toBe("franchise_123")
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("resolves and injects sales_channel_id for store routes", async () => {
    const graphMock = jest.fn().mockImplementation((config) => {
      const filters = config.filters ?? {}
      if ("franchise_id" in filters) {
        return Promise.resolve({ data: [{ sales_channel_id: "sc_123" }] })
      }
      return Promise.resolve({ data: [] })
    })

    const req = {
      headers: {
        "x-franchise-id": "franchise_123",
      },
      path: "/store/products",
      url: "/store/products",
      method: "GET",
      scope: {
        resolve: jest.fn().mockReturnValue({ graph: graphMock }),
      },
      query: { limit: "6" },
      validatedQuery: { limit: 6 },
    } as any

    const res = createResponse()
    const next = createNext()

    await franchiseTenantMiddleware(req, res as any, next)

    expect(req.franchise_id).toBe("franchise_123")
    expect(req.pricing_context?.sales_channel_id).toBe("sc_123")
    expect(req.query?.sales_channel_id).toEqual(["sc_123"])
    expect(req.validatedQuery?.sales_channel_id).toEqual(["sc_123"])
    expect(req.query?.limit).toBe("6")
    expect(req.validatedQuery?.limit).toBe(6)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("injects sales_channel_id into body/validatedBody for POST store routes", async () => {
    const graphMock = jest.fn().mockImplementation((config) => {
      const filters = config.filters ?? {}
      if ("franchise_id" in filters) {
        return Promise.resolve({ data: [{ sales_channel_id: "sc_123" }] })
      }
      return Promise.resolve({ data: [] })
    })

    const req = {
      headers: {
        "x-franchise-id": "franchise_123",
      },
      path: "/store/carts",
      url: "/store/carts",
      method: "POST",
      scope: {
        resolve: jest.fn().mockReturnValue({ graph: graphMock }),
      },
      body: {},
      validatedBody: {},
    } as any

    const res = createResponse()
    const next = createNext()

    await franchiseTenantMiddleware(req, res as any, next)

    expect(req.body?.sales_channel_id).toBe("sc_123")
    expect(req.validatedBody?.sales_channel_id).toBe("sc_123")
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe("store product franchise isolation", () => {
  /**
   * Build a `query.graph` mock that branches on the queried entity, so we can
   * model the franchise-product link table and the product table separately —
   * matching the filter-first scoping strategy.
   */
  const createGraphMock = (opts: {
    products?: Array<{ id?: string; metadata?: unknown }>
    links?: Array<{ product_id?: string }>
    storeLinks?: Array<{ product_id?: string; store_location_id?: string }>
  }) =>
    jest.fn().mockImplementation((config) => {
      const filters = config.filters ?? {}
      const fields = config.fields ?? []

      if (config.entity === "product") {
        return Promise.resolve({ data: opts.products ?? [] })
      }
      if (fields.includes("product_id") && fields.includes("store_location_id")) {
        return Promise.resolve({ data: opts.storeLinks ?? [] })
      }
      if ("franchise_id" in filters) {
        return Promise.resolve({ data: opts.links ?? [] })
      }
      return Promise.resolve({ data: [] })
    })

  it("filters an unfiltered browse to the franchise's linked ids", async () => {
    // No narrowing filter (status is applied by Medusa core, not by us) →
    // browse path: link table + metadata fallback run in parallel.
    const graph = createGraphMock({
      links: [{ product_id: "prod_1" }, { product_id: "prod_2" }],
      products: [],
    })
    const req = {
      franchise_id: "franchise_123",
      filterableFields: {
        status: "published",
      },
      headers: {},
      path: "/store/products",
      params: {},
      scope: {
        resolve: jest.fn().mockReturnValue({ graph }),
      },
    } as any
    const res = createResponse()
    const next = createNext()

    await filterStoreProductsByFranchise(req, res as any, next)

    expect(graph).toHaveBeenCalledWith({
      entity: FranchiseProductLink.entryPoint,
      fields: ["product_id"],
      filters: {
        franchise_id: "franchise_123",
      },
    })
    expect(req.filterableFields).toEqual({
      status: "published",
      id: ["prod_1", "prod_2"],
    })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("intersects existing product id filters with the franchise links", async () => {
    // Filter-first path: resolve the candidate set, then keep only candidates
    // that are linked to the franchise.
    const graph = createGraphMock({
      products: [
        { id: "prod_allowed", metadata: {} },
        { id: "prod_other", metadata: {} },
      ],
      links: [{ product_id: "prod_allowed" }],
    })
    const req = {
      franchise_id: "franchise_123",
      filterableFields: {
        id: ["prod_allowed", "prod_other"],
      },
      headers: {},
      path: "/store/products",
      params: {},
      scope: {
        resolve: jest.fn().mockReturnValue({ graph }),
      },
    } as any
    const res = createResponse()
    const next = createNext()

    await filterStoreProductsByFranchise(req, res as any, next)

    // Candidate set resolved from the client's id filter…
    expect(graph).toHaveBeenCalledWith({
      entity: "product",
      fields: ["id"],
      filters: { id: ["prod_allowed", "prod_other"] },
    })
    // …then ownership checked against the link table, bounded by candidates.
    expect(graph).toHaveBeenCalledWith({
      entity: FranchiseProductLink.entryPoint,
      fields: ["product_id"],
      filters: {
        franchise_id: "franchise_123",
        product_id: ["prod_allowed", "prod_other"],
      },
    })
    expect(req.filterableFields.id).toEqual(["prod_allowed"])
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("forwards a handle filter so it never scans the catalogue (Flaw B)", async () => {
    const graph = createGraphMock({
      products: [{ id: "prod_cake", metadata: {} }],
      links: [{ product_id: "prod_cake" }],
    })
    const req = {
      franchise_id: "franchise_123",
      filterableFields: {
        handle: "chocolate-cake",
      },
      headers: {},
      path: "/store/products",
      params: {},
      scope: {
        resolve: jest.fn().mockReturnValue({ graph }),
      },
    } as any
    const res = createResponse()
    const next = createNext()

    await filterStoreProductsByFranchise(req, res as any, next)

    // The candidate query is bounded by the handle — not an unfiltered scan.
    expect(graph).toHaveBeenCalledWith({
      entity: "product",
      fields: ["id"],
      filters: { handle: "chocolate-cake" },
    })
    // It must NEVER issue an unfiltered product scan.
    expect(graph).not.toHaveBeenCalledWith(
      expect.objectContaining({ entity: "product", filters: {} })
    )
    expect(req.filterableFields.id).toEqual(["prod_cake"])
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("lists an unfiltered browse from the link table without scanning products", async () => {
    // The franchise-product link table is the single source of truth, so a
    // whole-catalogue browse is one indexed link query — never a product scan.
    const graph = createGraphMock({
      links: [{ product_id: "prod_a" }, { product_id: "prod_b" }],
    })
    const req = {
      franchise_id: "franchise_123",
      filterableFields: {},
      headers: {},
      path: "/store/products",
      params: {},
      scope: {
        resolve: jest.fn().mockReturnValue({ graph }),
      },
    } as any
    const res = createResponse()
    const next = createNext()

    await filterStoreProductsByFranchise(req, res as any, next)

    expect(graph).toHaveBeenCalledWith({
      entity: FranchiseProductLink.entryPoint,
      fields: ["product_id"],
      filters: { franchise_id: "franchise_123" },
    })
    // The product table must never be queried on a browse.
    expect(graph).not.toHaveBeenCalledWith(
      expect.objectContaining({ entity: "product" })
    )
    expect(req.filterableFields.id).toEqual(["prod_a", "prod_b"])
    expect(next).toHaveBeenCalledTimes(1)
  })
})
