import {
  buildCategoryCountReport,
  detectMembershipPollution,
  diffCategorySets,
  extractPrefix,
  heuristicHandles,
  invertCategoryMembership,
  magentoCoverageRatio,
  resolveProductCategoryHandles,
  scrapeCategoryHandlesPaginated,
  stripGlobalFeaturedHandles,
} from "../cake-category-membership"
import * as cheerio from "cheerio"

describe("extractPrefix", () => {
  it("parses parenthetical codes with spaces", () => {
    expect(extractPrefix("( R161 ) Floral Cake", "floral-cake-r161")).toBe("r")
    expect(extractPrefix("(Ic63) Icing CoComelon", "icing-cocomelon-cake-ic63")).toBe(
      "ic"
    )
    expect(extractPrefix("(TD60) Avenger", "td60-avenger-butter-cream-cake")).toBe(
      "td"
    )
  })

  it("parses handle trailing codes", () => {
    expect(extractPrefix("Some Cake", "fresh-cream-cake-r1")).toBe("r")
    expect(extractPrefix("Vegan", "simple-vegan-cake-v11")).toBe("v")
  })
})

describe("heuristicHandles", () => {
  it("maps round prefix", () => {
    const h = heuristicHandles("(R2) Chocolate Drip Cake", "chocolate-drip-cake-r2")
    expect(h).toContain("round-cakes")
  })

  it("maps photo keyword", () => {
    const h = heuristicHandles("(R9) Unicorn Photo Cake", "unicorn-photo-cake-r9")
    expect(h).toContain("photo-cake")
    expect(h).toContain("round-cakes")
  })

  it("maps double high without tall-cakes", () => {
    const h = heuristicHandles("Double High Cake", "double-high-special")
    expect(h).toContain("double-tall-cakes")
    expect(h).not.toContain("tall-cakes")
  })

  it("maps avenger to novelty", () => {
    const h = heuristicHandles(
      "(TD60) Avenger Butter Cream Cake",
      "td60-avenger-butter-cream-cake"
    )
    expect(h).toContain("tiered-cakes")
    expect(h).toContain("novelty-kids-cakes")
  })
})

describe("resolveProductCategoryHandles", () => {
  it("unions scrape membership with heuristics", () => {
    const h = resolveProductCategoryHandles(
      "(R2) Chocolate Drip Cake",
      "chocolate-drip-cake-r2",
      ["click-and-collect", "fathers-day-cakes"]
    )
    expect(h).toContain("round-cakes")
    expect(h).toContain("click-and-collect")
    expect(h).toContain("fathers-day-cakes")
  })
})

describe("detectMembershipPollution / stripGlobalFeaturedHandles", () => {
  it("passes clean membership", () => {
    const byCat: Record<string, string[]> = {}
    for (let i = 0; i < 15; i++) {
      byCat[`cat-${i}`] = [`only-in-${i}`, `shared-a`, `shared-b`]
    }
    // only 2 global → OK with default minGlobalHandles 5
    expect(detectMembershipPollution(byCat)).toBeNull()
  })

  it("flags many global handles", () => {
    const globals = ["g1", "g2", "g3", "g4", "g5", "g6"]
    const byCat: Record<string, string[]> = {}
    for (let i = 0; i < 15; i++) {
      byCat[`cat-${i}`] = [...globals, `local-${i}`]
    }
    const reason = detectMembershipPollution(byCat)
    expect(reason).toMatch(/Pollution suspected/)
  })

  it("strips global featured handles", () => {
    const globals = ["g1", "g2", "g3", "g4", "g5", "g6"]
    const byCat: Record<string, string[]> = {}
    for (let i = 0; i < 15; i++) {
      byCat[`cat-${i}`] = [...globals, `local-${i}`]
    }
    const { cleaned, stripped } = stripGlobalFeaturedHandles(byCat)
    expect(stripped.sort()).toEqual(globals.sort())
    expect(cleaned["cat-0"]).toEqual(["local-0"])
    expect(detectMembershipPollution(cleaned)).toBeNull()
  })
})

describe("diffCategorySets / invert / coverage", () => {
  it("diffs sets", () => {
    expect(diffCategorySets(["a", "b"], ["b", "c"])).toEqual({
      added: ["c"],
      removed: ["a"],
    })
  })

  it("inverts membership", () => {
    const map = invertCategoryMembership({
      "round-cakes": ["cake-a", "cake-b"],
      "photo-cake": ["cake-a"],
    })
    expect(map.get("cake-a")?.has("round-cakes")).toBe(true)
    expect(map.get("cake-a")?.has("photo-cake")).toBe(true)
    expect(map.get("cake-b")?.has("photo-cake")).toBe(false)
  })

  it("coverage ratio", () => {
    const magento = ["a", "b", "missing-on-medusa"]
    const medusa = new Set(["a", "b"])
    const proposed = new Map([
      ["a", ["photo-cake"]],
      ["b", ["round-cakes"]],
    ])
    const r = magentoCoverageRatio(magento, medusa, proposed, "photo-cake")
    expect(r.eligible).toBe(2)
    expect(r.matched).toBe(1)
    expect(r.ratio).toBe(0.5)
  })

  it("buildCategoryCountReport", () => {
    const rows = buildCategoryCountReport(
      ["round-cakes", "photo-cake"],
      { "round-cakes": ["a", "b", "c"], "photo-cake": ["a"] },
      [
        {
          handle: "a",
          current: ["round-cakes"],
          proposed: ["round-cakes", "photo-cake"],
        },
        { handle: "b", current: [], proposed: ["round-cakes"] },
      ]
    )
    const photo = rows.find((r) => r.categoryHandle === "photo-cake")!
    expect(photo.currentCount).toBe(0)
    expect(photo.proposedCount).toBe(1)
    expect(photo.magentoCount).toBe(1)
    expect(photo.delta).toBe(1)
  })
})

describe("scrapeCategoryHandlesPaginated (fixture HTML)", () => {
  it("parses product-item-link and follows next page", async () => {
    const page1 = `
      <html><body>
        <div class="toolbar-amount">
          Items <span class="toolbar-number">1</span>-
          <span class="toolbar-number">2</span> of
          <span class="toolbar-number">3</span>
        </div>
        <ol class="products list">
          <li class="product-item">
            <a class="product-item-link" href="https://eggfreecakebreak.com/cake-one-r1">One</a>
          </li>
          <li class="product-item">
            <a class="product-item-link" href="https://eggfreecakebreak.com/cake-two-r2">Two</a>
          </li>
        </ol>
        <a class="action next" href="https://eggfreecakebreak.com/cakes/round-cakes?p=2">Next</a>
      </body></html>
    `
    const page2 = `
      <html><body>
        <ol class="products list">
          <li class="product-item">
            <a class="product-item-link" href="https://eggfreecakebreak.com/cake-three-r3">Three</a>
          </li>
        </ol>
      </body></html>
    `

    // Mock axios via interceptor on module — use nock-less approach:
    // replace scrape internals by testing cheerio extraction in isolation
    // Full axios mock:
    const axios = require("axios")
    const get = jest.spyOn(axios, "get").mockImplementation(async (url: string) => {
      if (String(url).includes("p=2")) return { data: page2 }
      return { data: page1 }
    })

    const logs: string[] = []
    const result = await scrapeCategoryHandlesPaginated(
      "round-cakes",
      "round-cakes",
      {
        info: (m) => logs.push(m),
        warn: (m) => logs.push(m),
      },
      { delayMs: 0, maxPages: 5 }
    )

    expect(result.handles.sort()).toEqual([
      "cake-one-r1",
      "cake-three-r3",
      "cake-two-r2",
    ])
    expect(result.pages).toBe(2)
    expect(result.toolbarTotal).toBe(3)

    get.mockRestore()
  })
})

describe("cheerio fixture sanity", () => {
  it("loads product links", () => {
    const $ = cheerio.load(
      `<a class="product-item-link" href="https://eggfreecakebreak.com/foo-r1">x</a>`
    )
    expect($("a.product-item-link").attr("href")).toContain("foo-r1")
  })
})
