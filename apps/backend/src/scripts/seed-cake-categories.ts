/**
 * seed-cake-categories.ts
 *
 * Creates Cake Break product categories matching eggfreecakebreak.com and
 * assigns every catalogue product into the right category buckets.
 *
 * Strategy
 * ────────
 * 1. Ensure the full category tree exists (shape + occasion groups).
 * 2. Deactivate leftover Medusa demo categories (Shirts, Merch, …).
 * 3. Assign membership:
 *    - Default: SKU/title heuristics only.
 *    - Magento mode: paginated grid scrape (source of truth for multi-list
 *      categories) UNION heuristics (fallback for new cakes not on Magento).
 *
 * Why not scrape by default
 * ─────────────────────────
 * Live Magento scrape is intentional ops, not every boot. An earlier full-page
 * scrape polluted every category with featured Round cakes; grid-only +
 * pagination + pollution detector fix that. Still keep scrape opt-in.
 *
 * Env
 * ───
 *   ENABLE_MAGENTO_CATEGORY_SCRAPE=true   # paginated Magento membership
 *   CATEGORY_ASSIGN_MODE=dry-run|apply    # default apply (writes DB)
 *   CATEGORY_MEMBERSHIP_CACHE=/path.json  # optional cache path for scrape
 *
 * Examples
 * ────────
 *   # Heuristics only (safe default)
 *   npx medusa exec ./src/scripts/seed-cake-categories.ts
 *
 *   # Magento-accurate dry-run (no DB writes)
 *   ENABLE_MAGENTO_CATEGORY_SCRAPE=true CATEGORY_ASSIGN_MODE=dry-run \
 *     npx medusa exec ./src/scripts/seed-cake-categories.ts
 *
 *   # Magento-accurate apply
 *   ENABLE_MAGENTO_CATEGORY_SCRAPE=true CATEGORY_ASSIGN_MODE=apply \
 *     npx medusa exec ./src/scripts/seed-cake-categories.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import {
  buildCategoryCountReport,
  detectMembershipPollution,
  diffCategorySets,
  invertCategoryMembership,
  magentoCoverageRatio,
  resolveProductCategoryHandles,
  scrapeCategoryHandlesPaginated,
  stripGlobalFeaturedHandles,
} from "../utils/cake-category-membership"

// Re-export resolver for import scripts that already import from this module
export { resolveProductCategoryHandles } from "../utils/cake-category-membership"

// ─── Category definitions (mirror eggfreecakebreak.com) ──────────────────────

type CakeCategoryDef = {
  name: string
  handle: string
  description: string
  /** Live Magento path under /cakes/ (if different from handle). */
  livePath?: string
  /** Rank among siblings (lower = first). */
  rank: number
}

/** Primary "shop by shape / style" categories shown on the homepage. */
const FEATURED_CATEGORIES: CakeCategoryDef[] = [
  {
    name: "Round Cakes",
    handle: "round-cakes",
    description: "Classic round birthday and celebration cakes.",
    rank: 10,
  },
  {
    name: "Square Cakes",
    handle: "square-cakes",
    description: "Square cream and decorated celebration cakes.",
    rank: 20,
  },
  {
    name: "Tall Cakes",
    handle: "tall-cakes",
    description: "Extra-tall buttercream and drip cakes.",
    rank: 30,
  },
  {
    name: "Heart Cakes",
    handle: "heart-cake",
    description: "Heart-shaped cakes for romance and celebrations.",
    rank: 40,
  },
  {
    name: "Icing Cakes",
    handle: "icing-cakes",
    description: "Fondant and icing-covered designer cakes.",
    rank: 50,
  },
  {
    name: "Novelty / Kids Cakes",
    handle: "novelty-kids-cakes",
    description: "Character and themed cakes for children.",
    rank: 60,
  },
  {
    name: "Number Cakes",
    handle: "number-cakes",
    description: "Number-shaped birthday cakes.",
    rank: 70,
  },
  {
    name: "Baby Shower / Christening Cakes",
    handle: "baby-shower-cakes",
    description: "Cakes for baby showers, christenings and gender reveals.",
    rank: 80,
  },
  {
    name: "Wedding Cakes",
    handle: "wedding-cakes",
    description: "Tiered and elegant wedding cakes.",
    rank: 90,
  },
  {
    name: "Tiered Cakes",
    handle: "tiered-cakes",
    description: "Multi-tier celebration cakes.",
    rank: 100,
  },
  {
    name: "Tray Cakes",
    handle: "tray-cakes",
    description: "Large tray cakes for parties and gatherings.",
    rank: 110,
  },
  {
    name: "Doll Cakes",
    handle: "doll-cakes",
    description: "Standing doll and princess cakes.",
    rank: 120,
  },
  {
    name: "Graduation Cakes",
    handle: "graduation-cakes",
    description: "Cakes for graduations and academic milestones.",
    rank: 130,
  },
  {
    name: "Click & Collect",
    handle: "click-and-collect",
    description: "Cakes available for quick click and collect.",
    rank: 140,
  },
  {
    name: "Umrah And Hajj Mubarak Cakes",
    handle: "umrah-and-hajj-mubarak-cake",
    description: "Cakes for Umrah and Hajj celebrations.",
    rank: 150,
  },
  {
    name: "Vegan & Dairy Free Cakes",
    handle: "vegan-cakes-dairy-free",
    description: "Vegan and dairy-free cakes.",
    rank: 160,
  },
  {
    name: "Cupcakes, Slices and Extras",
    handle: "cupcakes-slices-and-extras",
    description: "Delicious cupcakes, cake slices, and extra treats.",
    rank: 170,
  },
  {
    name: "Giant Cookies",
    handle: "giant-cookies",
    description: "Decorated giant cookies for celebrations.",
    rank: 180,
  },
  {
    name: "Chocolate Bouquets",
    handle: "chocolate-bouquets",
    description: "Gift chocolate bouquets.",
    rank: 190,
  },
  {
    name: "Photo Cakes",
    handle: "photo-cake",
    description: "Custom printed edible photo cakes.",
    rank: 145,
  },
  {
    name: "Double High Cakes",
    handle: "double-tall-cakes",
    description: "Extra height double-high celebration cakes.",
    rank: 35,
  },
]

/** Seasonal / occasion categories. */
const SEASONAL_CATEGORIES: CakeCategoryDef[] = [
  {
    name: "Christmas Cakes",
    handle: "christmas",
    livePath: "christmas-cakes-cupcakes",
    description: "Festive Christmas cakes and cupcakes.",
    rank: 200,
  },
  {
    name: "Diwali Cakes",
    handle: "diwali-cakes",
    description: "Diwali celebration cakes and boxes.",
    rank: 210,
  },
  {
    name: "Easter Cakes",
    handle: "easter",
    description: "Easter cakes and cupcakes.",
    rank: 220,
  },
  {
    name: "Father's Day Cakes",
    handle: "fathers-day-cakes",
    description: "Cakes for Father's Day.",
    rank: 230,
  },
  {
    name: "Lohri Cakes",
    handle: "lohri-cakes",
    description: "Lohri celebration cakes.",
    rank: 240,
  },
  {
    name: "Valentine's Day Cakes",
    handle: "valentines",
    description: "Romantic Valentine's cakes.",
    rank: 250,
  },
  {
    name: "Vaisakhi Cakes",
    handle: "vaisakhi-cakes",
    description: "Vaisakhi celebration cakes.",
    rank: 260,
  },
  {
    name: "Eid Cakes",
    handle: "eid-cakes",
    description: "Eid Mubarak cakes and cupcakes.",
    rank: 270,
  },
  {
    name: "Mother's Day Cakes",
    handle: "mothers-day-cakes",
    description: "Cakes for Mother's Day.",
    rank: 280,
  },
  {
    name: "Raksha Bandhan",
    handle: "raksha-bandhan",
    description: "Raksha Bandhan cakes and cupcakes.",
    rank: 290,
  },
]

const ALL_CATEGORIES = [...FEATURED_CATEGORIES, ...SEASONAL_CATEGORIES]

/** Demo categories left over from Medusa's initial seed — hide from storefront. */
const DEMO_CATEGORY_HANDLES = new Set([
  "shirts",
  "sweatshirts",
  "pants",
  "merch",
])

// ─── Main ────────────────────────────────────────────────────────────────────

export default async function seedCakeCategories({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any

  const enableScrape =
    process.env.ENABLE_MAGENTO_CATEGORY_SCRAPE === "1" ||
    process.env.ENABLE_MAGENTO_CATEGORY_SCRAPE === "true"

  const modeRaw = (process.env.CATEGORY_ASSIGN_MODE || "apply").toLowerCase()
  const dryRun = modeRaw === "dry-run" || modeRaw === "dryrun" || modeRaw === "report"
  const apply = !dryRun

  const cachePath =
    process.env.CATEGORY_MEMBERSHIP_CACHE ||
    path.join(process.cwd(), "tmp", "magento-category-membership.json")

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Cake Break Categories Seeder")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(
    `  Mode:   ${dryRun ? "DRY-RUN (no DB category writes for products)" : "APPLY"}`
  )
  logger.info(
    `  Source: ${enableScrape ? "Magento scrape (paginated) ∪ heuristics" : "heuristics only"}`
  )

  // 1. List existing categories
  const existing = await productService.listProductCategories(
    {},
    { take: 200, select: ["id", "name", "handle", "is_active", "is_internal"] }
  )
  const byHandle = new Map<string, { id: string; name: string; handle: string }>()
  for (const cat of existing) {
    byHandle.set(cat.handle, cat)
  }
  logger.info(`Found ${existing.length} existing product categories.`)

  // 2. Create / update Cake Break categories (always — tree must exist)
  const categoryIdByHandle = new Map<string, string>()

  for (const def of ALL_CATEGORIES) {
    const found = byHandle.get(def.handle)
    if (found) {
      if (apply) {
        await productService.updateProductCategories(found.id, {
          name: def.name,
          description: def.description,
          is_active: true,
          is_internal: false,
          rank: def.rank,
        })
      }
      categoryIdByHandle.set(def.handle, found.id)
      logger.info(
        `${apply ? "✓ Updated" : "· Would update"} category: ${def.name} (${def.handle})`
      )
    } else {
      if (apply) {
        const created = await productService.createProductCategories({
          name: def.name,
          handle: def.handle,
          description: def.description,
          is_active: true,
          is_internal: false,
          rank: def.rank,
        })
        const cat = Array.isArray(created) ? created[0] : created
        categoryIdByHandle.set(def.handle, cat.id)
        logger.info(`+ Created category: ${def.name} (${def.handle})`)
      } else {
        logger.info(
          `· Would create category: ${def.name} (${def.handle}) — run apply to create`
        )
        // dry-run without ID still allows report structure
        categoryIdByHandle.set(def.handle, `dry-run-${def.handle}`)
      }
    }
  }

  // 3. Hide Medusa demo categories
  if (apply) {
    for (const cat of existing) {
      if (!DEMO_CATEGORY_HANDLES.has(cat.handle)) continue
      await productService.updateProductCategories(cat.id, {
        is_active: false,
        is_internal: true,
      })
      logger.info(`⊘ Deactivated demo category: ${cat.name}`)
    }
  }

  // 4. Optional live Magento scrape (paginated)
  /** productHandle → set of category handles from Magento */
  const scrapedMap = new Map<string, Set<string>>()
  /** categoryHandle → product handles */
  const magentoByCategory: Record<string, string[]> = {}

  if (enableScrape) {
    logger.info(
      "\n📡 ENABLE_MAGENTO_CATEGORY_SCRAPE — paginated grid-only membership…"
    )

    // Prefer cache if present and CATEGORY_MEMBERSHIP_USE_CACHE=true
    const useCache =
      process.env.CATEGORY_MEMBERSHIP_USE_CACHE === "1" ||
      process.env.CATEGORY_MEMBERSHIP_USE_CACHE === "true"

    let loadedFromCache = false
    if (useCache && fs.existsSync(cachePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(cachePath, "utf8"))
        if (raw?.by_category) {
          for (const [ch, handles] of Object.entries(raw.by_category)) {
            magentoByCategory[ch] = handles as string[]
          }
          // Re-strip in case cache was written before featured filtering
          const { cleaned, stripped } =
            stripGlobalFeaturedHandles(magentoByCategory)
          Object.assign(magentoByCategory, cleaned)
          if (stripped.length) {
            logger.info(
              `  Cache: stripped ${stripped.length} global featured handle(s)`
            )
          }
          scrapedMap.clear()
          for (const [ph, set] of invertCategoryMembership(magentoByCategory)) {
            scrapedMap.set(ph, set)
          }
          loadedFromCache = true
          logger.info(
            `  Loaded membership cache from ${cachePath} (${scrapedMap.size} products)`
          )
        }
      } catch (e: any) {
        logger.warn(`  Failed to load cache: ${e.message}`)
      }
    }

    if (!loadedFromCache) {
      for (const def of ALL_CATEGORIES) {
        const livePath = def.livePath ?? def.handle
        const result = await scrapeCategoryHandlesPaginated(
          def.handle,
          livePath,
          logger
        )
        magentoByCategory[def.handle] = result.handles
      }

      // Magento injects the same "featured/new" product-item links into every
      // category grid. Strip those globals; they still get shape/style via heuristics.
      const { cleaned, stripped } = stripGlobalFeaturedHandles(magentoByCategory)
      Object.assign(magentoByCategory, cleaned)
      if (stripped.length) {
        logger.info(
          `  Stripped ${stripped.length} globally-featured handle(s) from Magento membership ` +
            `(heuristic-only for those SKUs): ${stripped.slice(0, 10).join(", ")}` +
            (stripped.length > 10 ? "…" : "")
        )
      }

      // Build product → categories map after strip
      scrapedMap.clear()
      const inverted = invertCategoryMembership(magentoByCategory)
      for (const [ph, set] of inverted) {
        scrapedMap.set(ph, set)
      }

      // Write cache (post-strip)
      try {
        const dir = path.dirname(cachePath)
        fs.mkdirSync(dir, { recursive: true })
        const byProduct: Record<string, string[]> = {}
        for (const [ph, set] of scrapedMap) {
          byProduct[ph] = Array.from(set).sort()
        }
        fs.writeFileSync(
          cachePath,
          JSON.stringify(
            {
              scraped_at: new Date().toISOString(),
              stripped_global_featured: stripped,
              by_category: magentoByCategory,
              by_product: byProduct,
            },
            null,
            2
          )
        )
        logger.info(`  Wrote membership cache → ${cachePath}`)
      } catch (e: any) {
        logger.warn(`  Could not write cache: ${e.message}`)
      }
    } else {
      // Cache already filled scrapedMap + magentoByCategory
    }

    logger.info(`Scraped membership for ${scrapedMap.size} product handles.`)

    const pollution = detectMembershipPollution(magentoByCategory)
    if (pollution) {
      logger.error(`\n❌ ${pollution}`)
      if (apply) {
        logger.error("Aborting APPLY due to pollution. Fix scrape or use dry-run.")
        return
      }
      logger.warn("Continuing dry-run for diagnosis only.")
    } else {
      logger.info("  Pollution check: OK")
    }
  } else {
    logger.info(
      "\n⏭  Skipping Magento scrape (heuristics-only assignment). " +
        "Set ENABLE_MAGENTO_CATEGORY_SCRAPE=true for Magento-accurate multi-list."
    )
  }

  // 5. Load all products (with current categories for diff)
  logger.info(
    "\n🧁 Planning product → category assignment (" +
      (enableScrape ? "heuristics + scrape" : "heuristics only") +
      ")…"
  )

  type ProductRow = {
    id: string
    title: string
    handle: string
    current: string[]
    proposed: string[]
  }

  const productRows: ProductRow[] = []
  {
    const pageSize = 200
    let skip = 0
    for (;;) {
      const batch = await productService.listProducts(
        {},
        {
          take: pageSize,
          skip,
          relations: ["categories"],
        }
      )
      if (!batch?.length) break
      for (const p of batch) {
        const handle = (p.handle || "").toLowerCase()
        const title = p.title || ""
        if (handle === "cakes" || title.toLowerCase() === "our cakes") continue

        const current = ((p.categories || []) as Array<{ handle?: string }>)
          .map((c) => c.handle)
          .filter((h): h is string => Boolean(h))
          .sort()

        const scraped = enableScrape ? scrapedMap.get(handle) : null
        const proposed = resolveProductCategoryHandles(
          title,
          handle,
          scraped
        ).sort()

        productRows.push({
          id: p.id,
          title,
          handle,
          current,
          proposed,
        })
      }
      if (batch.length < pageSize) break
      skip += pageSize
    }
  }
  logger.info(`Loaded ${productRows.length} products.`)

  // 6. Diff report
  const allCatHandles = ALL_CATEGORIES.map((c) => c.handle)
  const countReport = buildCategoryCountReport(
    allCatHandles,
    magentoByCategory,
    productRows.map((p) => ({
      handle: p.handle,
      current: p.current,
      proposed: p.proposed,
    }))
  )

  logger.info("\n📊 Per-category counts (current → proposed" +
    (enableScrape ? ", Magento unique" : "") +
    "):")
  logger.info(
    "  " +
      "category".padEnd(32) +
      "current".padStart(8) +
      "proposed".padStart(10) +
      "delta".padStart(8) +
      (enableScrape ? "magento".padStart(9) : "")
  )
  for (const row of countReport) {
    const mag =
      enableScrape && row.magentoCount != null
        ? String(row.magentoCount).padStart(9)
        : enableScrape
          ? "        -"
          : ""
    logger.info(
      "  " +
        row.categoryHandle.padEnd(32) +
        String(row.currentCount).padStart(8) +
        String(row.proposedCount).padStart(10) +
        (row.delta >= 0 ? `+${row.delta}` : String(row.delta)).padStart(8) +
        mag
    )
  }

  // Magento coverage for weak categories
  if (enableScrape) {
    const medusaHandles = new Set(productRows.map((p) => p.handle))
    const proposedByProduct = new Map(
      productRows.map((p) => [p.handle, p.proposed] as const)
    )
    const weak = [
      "click-and-collect",
      "photo-cake",
      "double-tall-cakes",
      "fathers-day-cakes",
      "mothers-day-cakes",
      "vaisakhi-cakes",
      "giant-cookies",
      "vegan-cakes-dairy-free",
      "chocolate-bouquets",
    ]
    logger.info("\n📈 Magento coverage (handles that exist in Medusa):")
    for (const ch of weak) {
      const magHandles = magentoByCategory[ch] || []
      const { matched, eligible, ratio } = magentoCoverageRatio(
        magHandles,
        medusaHandles,
        proposedByProduct,
        ch
      )
      logger.info(
        `  ${ch.padEnd(32)} ${matched}/${eligible} (${(ratio * 100).toFixed(1)}%)`
      )
    }
  }

  // Sample adds for key categories
  const sampleAdds: string[] = []
  for (const p of productRows) {
    const { added, removed } = diffCategorySets(p.current, p.proposed)
    if (added.length || removed.length) {
      if (sampleAdds.length < 25) {
        sampleAdds.push(
          `${p.handle}: +[${added.join(",")}] -[${removed.join(",")}]`
        )
      }
    }
  }
  if (sampleAdds.length) {
    logger.info("\n🔄 Sample membership changes:")
    for (const s of sampleAdds) logger.info(`  • ${s}`)
  }

  // Write report file
  const reportPath =
    process.env.CATEGORY_ASSIGN_REPORT ||
    path.join(process.cwd(), "tmp", "category-assign-report.json")
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          mode: dryRun ? "dry-run" : "apply",
          enable_scrape: enableScrape,
          product_count: productRows.length,
          category_counts: countReport,
          samples: sampleAdds,
          uncategorised_proposed: productRows
            .filter((p) => p.proposed.length === 0)
            .map((p) => p.handle),
        },
        null,
        2
      )
    )
    logger.info(`\n  Report written → ${reportPath}`)
  } catch (e: any) {
    logger.warn(`  Could not write report: ${e.message}`)
  }

  if (dryRun) {
    logger.info("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info("  DRY-RUN complete — no product category_ids written.")
    logger.info("  Re-run with CATEGORY_ASSIGN_MODE=apply to commit.")
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return
  }

  // 7. Apply
  let updated = 0
  let uncategorised = 0
  let multiCat = 0
  const multiCatSamples: string[] = []

  for (const row of productRows) {
    if (row.proposed.length > 1) {
      multiCat++
      if (multiCatSamples.length < 15) {
        multiCatSamples.push(`${row.handle} → ${row.proposed.join(",")}`)
      }
    }

    const categoryIds = row.proposed
      .map((h) => categoryIdByHandle.get(h))
      .filter(
        (id): id is string => Boolean(id) && !String(id).startsWith("dry-run-")
      )

    if (!categoryIds.length) {
      uncategorised++
      try {
        await productService.updateProducts(row.id, { category_ids: [] })
      } catch {
        // ignore
      }
      continue
    }

    try {
      await productService.updateProducts(row.id, {
        category_ids: categoryIds,
      })
      updated++
    } catch (err: any) {
      logger.warn(
        `  failed to update ${row.handle}: ${err?.message ?? String(err)}`
      )
    }
  }

  logger.info("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  Categories ready:     ${categoryIdByHandle.size}`)
  logger.info(`  Products updated:     ${updated}`)
  logger.info(`  Uncategorised:        ${uncategorised}`)
  logger.info(`  Multi-category (ok):  ${multiCat}`)
  logger.info(
    `  Mode:                 ${enableScrape ? "heuristics+scrape" : "heuristics-only"} / apply`
  )
  if (multiCatSamples.length) {
    logger.info("  Multi-category samples:")
    for (const s of multiCatSamples) logger.info(`    • ${s}`)
  }
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
