import {
  spongeNeedlesFor,
  hasCatalogueFilters,
  captureCatalogueQueryFilters,
  filterProductIdsBySponge,
  filterProductIdsByPrice,
  searchTokensFor,
  isProductCodeToken,
  classifyCatalogueSearch,
  productCodeFromTitle,
  normalizeProductCode,
  filterProductIdsBySearch,
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

  it("strips parentheses so (R1) tokenises as a code", () => {
    expect(searchTokensFor("(R1)")).toEqual(["r1"])
  })
})

describe("isProductCodeToken", () => {
  it("accepts Magento-style product codes", () => {
    expect(isProductCodeToken("r1")).toBe(true)
    expect(isProductCodeToken("r1x")).toBe(true)
    expect(isProductCodeToken("x2")).toBe(true)
    expect(isProductCodeToken("sq12")).toBe(true)
  })

  it("rejects free-text and non-code shapes", () => {
    expect(isProductCodeToken("cake")).toBe(false)
    expect(isProductCodeToken("12")).toBe(false)
    expect(isProductCodeToken("8inch")).toBe(false)
    expect(isProductCodeToken("r-1")).toBe(false)
    expect(isProductCodeToken("chocolate")).toBe(false)
  })
})

describe("classifyCatalogueSearch", () => {
  it("classifies a single code token as code mode", () => {
    expect(classifyCatalogueSearch(["r1"])).toEqual({
      mode: "code",
      code: "r1",
    })
  })

  it("classifies one code + free-text as hybrid", () => {
    expect(classifyCatalogueSearch(["r1", "cake"])).toEqual({
      mode: "hybrid",
      code: "r1",
      freeTextTokens: ["cake"],
    })
  })

  it("disables code mode when two+ code tokens are present", () => {
    expect(classifyCatalogueSearch(["r1", "r1x"])).toEqual({
      mode: "free_text",
      tokens: ["r1", "r1x"],
    })
  })

  it("uses free-text when no code tokens", () => {
    expect(classifyCatalogueSearch(["chocolate", "drip"])).toEqual({
      mode: "free_text",
      tokens: ["chocolate", "drip"],
    })
  })
})

describe("productCodeFromTitle", () => {
  it("extracts leading (CODE) from Magento-style titles", () => {
    expect(productCodeFromTitle("(R1) Simple Fresh Cream Cake")).toBe("r1")
    expect(productCodeFromTitle("(R1X) Something Cake")).toBe("r1x")
    expect(productCodeFromTitle("(X2) Christmas Themed Cake")).toBe("x2")
    expect(
      productCodeFromTitle("(Tall 91) Floral base tall elegant cake")
    ).toBe("tall 91")
  })

  it("returns null when code is missing or not at the start", () => {
    expect(productCodeFromTitle("No code cake")).toBeNull()
    expect(productCodeFromTitle("Cake (approx 10 servings)")).toBeNull()
    expect(productCodeFromTitle(null)).toBeNull()
    expect(productCodeFromTitle(undefined)).toBeNull()
    expect(productCodeFromTitle("  ")).toBeNull()
  })
})

describe("normalizeProductCode", () => {
  it("strips spaces/punctuation so Tall91 matches title (Tall 91)", () => {
    expect(normalizeProductCode("Tall91")).toBe("tall91")
    expect(normalizeProductCode("tall 91")).toBe("tall91")
    expect(normalizeProductCode("TALL-91")).toBe("tall91")
  })

  it("keeps R1 distinct from R1X", () => {
    expect(normalizeProductCode("R1")).toBe("r1")
    expect(normalizeProductCode("R1X")).toBe("r1x")
    expect(normalizeProductCode("R1")).not.toBe(normalizeProductCode("R1X"))
  })
})

describe("filterProductIdsBySearch modes", () => {
  function mockKnex(handler: (sql: string, bindings: unknown[]) => string[]) {
    return {
      raw: jest.fn(async (sql: string, bindings?: unknown[]) => ({
        rows: handler(sql, bindings ?? []).map((id) => ({ product_id: id })),
      })),
    }
  }

  it("uses exact title-code SQL for a single code query (not LIKE %r1%)", async () => {
    const knex = mockKnex((sql, bindings) => {
      expect(sql).toMatch(/SUBSTRING\(p\.title FROM/)
      expect(sql).toMatch(/regexp_replace/)
      expect(sql).not.toMatch(/LIKE/)
      expect(bindings[1]).toBe("r1")
      return ["prod_r1"]
    })

    const ids = await filterProductIdsBySearch(
      knex as any,
      ["prod_r1", "prod_r1x"],
      "R1"
    )
    expect(ids).toEqual(["prod_r1"])
    expect(knex.raw).toHaveBeenCalledTimes(1)
  })

  it("normalises spaced title codes so Tall91 matches (Tall 91)", async () => {
    const knex = mockKnex((sql, bindings) => {
      expect(sql).toMatch(/regexp_replace/)
      expect(sql).toMatch(/SUBSTRING\(p\.title FROM/)
      // Query "Tall91" → normalised binding tall91 (matches title code "tall 91")
      expect(bindings[1]).toBe("tall91")
      return ["prod_tall91"]
    })

    const ids = await filterProductIdsBySearch(
      knex as any,
      ["prod_tall91", "prod_other"],
      "Tall91"
    )
    expect(ids).toEqual(["prod_tall91"])
    expect(isProductCodeToken("tall91")).toBe(true)
    expect(classifyCatalogueSearch(["tall91"])).toEqual({
      mode: "code",
      code: "tall91",
    })
  })

  it("hybrid: exact code first, then free-text AND only (no second OR pass)", async () => {
    const knex = mockKnex((sql, bindings) => {
      if (sql.includes("SUBSTRING")) {
        expect(bindings[1]).toBe("r1")
        return ["prod_r1"]
      }
      // free-text for remaining tokens only (field-level OR is expected)
      expect(sql).toMatch(/LIKE/)
      expect(sql).not.toMatch(/SUBSTRING/)
      const likes = (bindings as unknown[]).slice(1)
      expect(likes).toEqual(["%cake%", "%cake%", "%cake%"])
      return ["prod_r1"]
    })

    const ids = await filterProductIdsBySearch(
      knex as any,
      ["prod_r1", "prod_r1x"],
      "R1 cake"
    )
    expect(ids).toEqual(["prod_r1"])
    // code query + one free-text AND pass only (no OR fallback call)
    expect(knex.raw).toHaveBeenCalledTimes(2)
  })

  it("hybrid returns empty when exact code misses (no free-text fallback)", async () => {
    const knex = mockKnex((sql) => {
      expect(sql).toMatch(/SUBSTRING/)
      return []
    })

    const ids = await filterProductIdsBySearch(
      knex as any,
      ["prod_r1", "prod_r1x"],
      "R99 cake"
    )
    expect(ids).toEqual([])
    expect(knex.raw).toHaveBeenCalledTimes(1)
  })

  it("two code tokens stay on free-text LIKE path", async () => {
    const knex = mockKnex((sql, bindings) => {
      expect(sql).toMatch(/LIKE/)
      expect(sql).not.toMatch(/SUBSTRING/)
      const likes = (bindings as unknown[]).slice(1)
      expect(likes).toContain("%r1%")
      expect(likes).toContain("%r1x%")
      return ["prod_r1", "prod_r1x"]
    })

    const ids = await filterProductIdsBySearch(
      knex as any,
      ["prod_r1", "prod_r1x"],
      "R1 R1X"
    )
    expect(ids).toEqual(["prod_r1", "prod_r1x"])
  })

  it("pure free-text still uses partial LIKE", async () => {
    const knex = mockKnex((sql, bindings) => {
      expect(sql).toMatch(/LIKE/)
      expect(sql).not.toMatch(/SUBSTRING/)
      expect((bindings as unknown[]).slice(1)).toEqual([
        "%chocolate%",
        "%chocolate%",
        "%chocolate%",
      ])
      return ["prod_choc"]
    })

    const ids = await filterProductIdsBySearch(
      knex as any,
      ["prod_choc", "prod_other"],
      "chocolate"
    )
    expect(ids).toEqual(["prod_choc"])
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
