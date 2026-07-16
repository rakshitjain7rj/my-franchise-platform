import {
  spongeNeedlesFor,
  hasCatalogueFilters,
  captureCatalogueQueryFilters,
  filterProductIdsBySponge,
  filterProductIdsByPrice,
  searchTokensFor,
} from "../catalogue-product-filters"

describe("spongeNeedlesFor", () => {
  it("maps known handles to option needles", () => {
    expect(spongeNeedlesFor("chocolate")).toEqual([
      "eggless chocolate",
      "chocolate",
    ])
    expect(spongeNeedlesFor("victoria")).toEqual([
      "eggless vanilla",
      "victoria",
      "vanilla",
    ])
    expect(spongeNeedlesFor("red-velvet")).toEqual([
      "eggless red velvet",
      "red velvet",
      "red-velvet",
    ])
    expect(spongeNeedlesFor("vanilla")).toEqual([
      "eggless vanilla",
      "victoria",
      "vanilla",
    ])
  })

  it("returns null for empty", () => {
    expect(spongeNeedlesFor(undefined)).toBeNull()
    expect(spongeNeedlesFor("  ")).toBeNull()
  })

  it("passes free-text through", () => {
    expect(spongeNeedlesFor("lemon-drizzle")).toEqual([
      "lemon-drizzle",
      "lemon drizzle",
    ])
  })
})

describe("hasCatalogueFilters", () => {
  it("detects active filters", () => {
    expect(hasCatalogueFilters(undefined)).toBe(false)
    expect(hasCatalogueFilters({})).toBe(false)
    expect(hasCatalogueFilters({ sponge: "chocolate" })).toBe(true)
    expect(hasCatalogueFilters({ minPrice: 10 })).toBe(true)
    expect(hasCatalogueFilters({ maxPrice: 40 })).toBe(true)
    expect(hasCatalogueFilters({ search: "teddy" })).toBe(true)
  })
})

describe("searchTokensFor", () => {
  it("splits multi-word queries", () => {
    expect(searchTokensFor("Chocolate Drip")).toEqual(["chocolate", "drip"])
    expect(searchTokensFor("  R1  ")).toEqual(["r1"])
  })
})

describe("captureCatalogueQueryFilters", () => {
  it("stashes and strips custom query params", () => {
    const req: any = {
      query: {
        limit: "24",
        q: "teddy cake",
        sponge: "chocolate",
        min_price: "25",
        max_price: "40",
        flavour: "should-not-win",
      },
    }
    const next = jest.fn()
    captureCatalogueQueryFilters(req, {}, next)

    expect(req.catalogue_filters).toEqual({
      search: "teddy cake",
      sponge: "chocolate",
      minPrice: 25,
      maxPrice: 40,
    })
    expect(req.query.q).toBeUndefined()
    expect(req.query.sponge).toBeUndefined()
    expect(req.query.min_price).toBeUndefined()
    expect(req.query.max_price).toBeUndefined()
    expect(req.query.limit).toBe("24")
    expect(next).toHaveBeenCalled()
  })

  it("accepts flavour / flavor aliases", () => {
    const req: any = { query: { flavour: "red-velvet" } }
    captureCatalogueQueryFilters(req, {}, jest.fn())
    expect(req.catalogue_filters?.sponge).toBe("red-velvet")
  })

  it("rewrites broken calculated_price order into priceSort", () => {
    const reqAsc: any = {
      query: { order: "variants.calculated_price.calculated_amount" },
    }
    captureCatalogueQueryFilters(reqAsc, {}, jest.fn())
    expect(reqAsc.catalogue_filters?.priceSort).toBe("asc")
    expect(reqAsc.query.order).toBeUndefined()

    const reqDesc: any = {
      query: { order: "-variants.calculated_price.calculated_amount" },
    }
    captureCatalogueQueryFilters(reqDesc, {}, jest.fn())
    expect(reqDesc.catalogue_filters?.priceSort).toBe("desc")
    expect(reqDesc.query.order).toBeUndefined()
  })

  it("leaves title / created_at order intact", () => {
    const req: any = { query: { order: "title" } }
    captureCatalogueQueryFilters(req, {}, jest.fn())
    expect(req.catalogue_filters).toBeUndefined()
    expect(req.query.order).toBe("title")
  })
})

describe("filterProductIdsBySponge (SQL)", () => {
  it("returns empty for empty allow-list", async () => {
    const knex = { raw: jest.fn() }
    const ids = await filterProductIdsBySponge(knex as any, [], "chocolate")
    expect(ids).toEqual([])
    expect(knex.raw).not.toHaveBeenCalled()
  })

  it("maps product_id rows from knex", async () => {
    const knex = {
      raw: jest.fn().mockResolvedValue({
        rows: [{ product_id: "prod_a" }, { product_id: "prod_b" }],
      }),
    }
    const ids = await filterProductIdsBySponge(
      knex as any,
      ["prod_a", "prod_b", "prod_c"],
      "chocolate"
    )
    expect(ids).toEqual(["prod_a", "prod_b"])
    expect(knex.raw).toHaveBeenCalledTimes(1)
  })
})

describe("filterProductIdsByPrice (SQL)", () => {
  it("no-ops without bounds", async () => {
    const knex = { raw: jest.fn() }
    const ids = await filterProductIdsByPrice(knex as any, ["p1"], undefined, undefined)
    expect(ids).toEqual(["p1"])
    expect(knex.raw).not.toHaveBeenCalled()
  })

  it("maps product_id rows", async () => {
    const knex = {
      raw: jest.fn().mockResolvedValue({
        rows: [{ product_id: "prod_cheap" }],
      }),
    }
    const ids = await filterProductIdsByPrice(knex as any, ["prod_cheap", "prod_x"], 0, 25)
    expect(ids).toEqual(["prod_cheap"])
  })
})
