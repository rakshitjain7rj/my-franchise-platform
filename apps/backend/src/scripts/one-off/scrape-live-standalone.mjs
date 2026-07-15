/**
 * Standalone runner (no Medusa bootstrap) — scrapes eggfreecakebreak.com
 * with Cheerio and updates the product table + dietary_tag links via SQL.
 *
 * Prefer the medusa exec script when the backend is up; use this when only
 * Postgres is available (e.g. docker db container).
 *
 *   DATABASE_URL=postgres://… node src/scripts/one-off/scrape-live-standalone.mjs
 */

import axios from "axios"
import * as cheerio from "cheerio"
import pg from "pg"
import { randomBytes } from "crypto"

const BASE_URL = "https://eggfreecakebreak.com"
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://medusa:CodeationCakeBreak123@localhost:5432/medusa-db"

const dryRun = process.env.SCRAPE_DRY_RUN === "1"
const limit = process.env.SCRAPE_LIMIT
  ? parseInt(process.env.SCRAPE_LIMIT, 10)
  : null
const concurrency = Math.max(
  1,
  parseInt(process.env.SCRAPE_CONCURRENCY || "4", 10) || 4
)
const delayMs = Math.max(
  0,
  parseInt(process.env.SCRAPE_DELAY_MS || "150", 10) || 150
)

const PLACEHOLDER_ALLERGENS = new Set(["Gluten, Dairy", "Nuts, Gluten, Dairy"])

function isPlaceholderIngredients(value) {
  if (typeof value !== "string") return false
  const t = value.trim()
  if (!t) return false
  if (
    t ===
    "Flour, Sugar, Butter, Milk, Raising agents, Natural flavourings"
  )
    return true
  if (/^Premium .+ elements, Organic Flour, Cane Sugar, Sweet Butter\.?$/i.test(t))
    return true
  return false
}

function isPlaceholderAllergens(value) {
  if (typeof value === "string") return PLACEHOLDER_ALLERGENS.has(value.trim())
  if (Array.isArray(value))
    return PLACEHOLDER_ALLERGENS.has(value.map(String).join(", "))
  return false
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function normalizeHandle(handle) {
  return String(handle || "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
}

function textOf($, sel) {
  return $(sel).first().text().replace(/\s+/g, " ").trim()
}

function extractLabeledField(blob, labels) {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-]\\s*([^\\n\\r|]+)`, "i")
    const m = blob.match(re)
    if (m?.[1]) {
      const v = m[1].trim().replace(/\s+/g, " ")
      if (v.length > 2 && v.length < 500) return v
    }
  }
  return null
}

/** Magento often puts "Allergens: Milk, Wheat, …Product Title" in overview. */
const KNOWN_ALLERGEN_TOKENS = [
  "milk",
  "dairy",
  "wheat",
  "gluten",
  "nuts",
  "nut",
  "peanut",
  "peanuts",
  "tree nuts",
  "egg",
  "eggs",
  "soya",
  "soy",
  "sesame",
  "sulphites",
  "sulfites",
  "lupin",
  "celery",
  "mustard",
  "fish",
  "crustaceans",
  "molluscs",
  "mollusks",
]

function cleanAllergenList(raw, title = "") {
  if (!raw) return null
  let text = raw.replace(/\s+/g, " ").trim()
  // Drop trailing title if Magento appended it
  if (title) {
    const t = title.replace(/^\([^)]+\)\s*/, "").trim()
    if (t && text.toLowerCase().endsWith(t.toLowerCase())) {
      text = text.slice(0, -t.length).trim().replace(/[,\s]+$/, "")
    }
  }
  // Prefer known allergen tokens when the rest looks like product marketing copy
  const parts = text.split(/,|\/|;|\band\b/i).map((s) => s.trim()).filter(Boolean)
  const known = []
  for (const p of parts) {
    const low = p.toLowerCase()
    if (KNOWN_ALLERGEN_TOKENS.some((k) => low === k || low.startsWith(k + " "))) {
      // normalise casing
      const token = KNOWN_ALLERGEN_TOKENS.find((k) => low === k || low.startsWith(k + " "))
      known.push(token.charAt(0).toUpperCase() + token.slice(1))
    }
  }
  if (known.length) return [...new Set(known)].join(", ")
  // If short and no marketing fluff, keep as-is
  if (text.length <= 80 && !/cake|cream|birthday|sprinkle/i.test(text)) {
    return text
  }
  return known.length ? [...new Set(known)].join(", ") : null
}

function cleanIngredientsList(raw, title = "") {
  if (!raw) return null
  let text = raw.replace(/\s+/g, " ").trim()
  if (title) {
    const t = title.replace(/^\([^)]+\)\s*/, "").trim()
    if (t && text.toLowerCase().endsWith(t.toLowerCase())) {
      text = text.slice(0, -t.length).trim().replace(/[,\s]+$/, "")
    }
  }
  if (text.length < 3) return null
  if (isPlaceholderIngredients(text)) return null
  return text
}

function detectDietaryFromText(blob) {
  const lower = blob.toLowerCase()
  const out = new Set()
  if (
    /egg\s*-?\s*free/.test(lower) ||
    /\beggless\b/.test(lower) ||
    /\beggfree\b/.test(lower) ||
    /without egg/.test(lower) ||
    /no eggs?\b/.test(lower)
  ) {
    out.add("Eggless")
  }
  if (/\bvegan\b/.test(lower)) {
    out.add("Vegan")
    out.add("Dairy-free")
    out.add("Eggless")
  }
  if (/dairy\s*-?\s*free/.test(lower) || /without dairy/.test(lower)) {
    out.add("Dairy-free")
  }
  if (/gluten\s*-?\s*free/.test(lower)) out.add("Gluten-free")
  if (/\bhalal\b/.test(lower)) out.add("Halal")
  if (/nut\s*-?\s*free/.test(lower) || /without nuts?/.test(lower)) {
    out.add("Nut-free")
  }
  return [...out]
}

function parseProductHtml(html, handle) {
  const $ = cheerio.load(html)
  const title =
    textOf($, ".page-title .base") ||
    textOf($, "h1.page-title") ||
    $("title").first().text().split("-")[0]?.trim() ||
    ""
  const overview = textOf($, ".product.attribute.overview .value")
  const description =
    textOf($, ".product.attribute.description .value") ||
    textOf($, "#description .value") ||
    textOf($, "#product\\.info\\.description")
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() || ""
  const sku = textOf($, ".product.attribute.sku .value")

  const rawAttributeMap = {}
  $(
    "#product-attribute-specs-table tr, .additional-attributes tr, table.data.table.additional-attributes tr"
  ).each((_, tr) => {
    const th = $(tr).find("th").text().replace(/\s+/g, " ").trim()
    const td = $(tr).find("td").text().replace(/\s+/g, " ").trim()
    if (th && td) rawAttributeMap[th] = td
  })

  let ingredients = null
  let allergens = null
  for (const [key, val] of Object.entries(rawAttributeMap)) {
    if (/ingredient/i.test(key) && val) ingredients = val
    if (/allergen/i.test(key) && val) allergens = val
  }

  const blob = [
    title,
    overview,
    description,
    metaDescription,
    ...Object.values(rawAttributeMap),
  ]
    .filter(Boolean)
    .join("\n")

  ingredients =
    ingredients ||
    extractLabeledField(blob, [
      "Ingredients?",
      "Ingredient list",
      "Contains ingredients?",
    ])
  allergens =
    allergens ||
    extractLabeledField(blob, [
      "Allergens?",
      "Allergy advice",
      "Allergen information",
    ])

  // Overview sometimes is entirely "Allergens: Milk, Wheat, …"
  if (!allergens && /allergens?\s*:/i.test(overview)) {
    allergens = extractLabeledField(overview, ["Allergens?"])
  }
  if (!ingredients && /ingredients?\s*:/i.test(overview + "\n" + description)) {
    ingredients = extractLabeledField(
      overview + "\n" + description,
      ["Ingredients?"]
    )
  }

  ingredients = cleanIngredientsList(ingredients, title)
  allergens = cleanAllergenList(allergens, title)

  if (ingredients && isPlaceholderIngredients(ingredients)) ingredients = null
  if (allergens && isPlaceholderAllergens(allergens)) allergens = null

  const dietaryNames = detectDietaryFromText(blob)
  const is404 =
    /404 not found/i.test(title) ||
    /cms-no-route/i.test(html) ||
    !title

  if (!is404 && !dietaryNames.includes("Eggless")) {
    dietaryNames.push("Eggless")
  }

  return {
    handle,
    title,
    overview,
    description,
    metaDescription,
    sku,
    ingredients,
    allergens,
    dietaryNames: [...new Set(dietaryNames)],
    ok: !is404,
  }
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CakeBreakCatalogueBot/1.0; +https://eggfreecakebreak.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    timeout: 25000,
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  })
  return String(res.data)
}

async function scrapeCategoryHandles() {
  const map = new Map()
  const cats = [
    {
      url: `${BASE_URL}/cakes/vegan-cakes-dairy-free`,
      tags: ["Vegan", "Dairy-free", "Eggless"],
    },
  ]

  for (const cat of cats) {
    let page = 1
    let empty = 0
    const seen = new Set()
    while (page <= 20) {
      const url = page === 1 ? cat.url : `${cat.url}?p=${page}`
      try {
        console.log(`  category ${url}`)
        const html = await fetchHtml(url)
        const $ = cheerio.load(html)
        let found = 0
        $("a.product-item-link, a.product.photo, .product-item-info a").each(
          (_, el) => {
            const href = $(el).attr("href") || ""
            if (!href.startsWith(BASE_URL)) return
            const path = href
              .substring(BASE_URL.length)
              .replace(/^\/+|\/+$/g, "")
            if (!path || path.startsWith("cakes/") || path.includes("?")) return
            const handle = normalizeHandle(path)
            if (!handle || seen.has(handle)) return
            seen.add(handle)
            found++
            if (!map.has(handle)) map.set(handle, new Set())
            for (const t of cat.tags) map.get(handle).add(t)
          }
        )
        if (found === 0) {
          empty++
          if (empty >= 2) break
        } else empty = 0
        page++
        await sleep(200)
      } catch (e) {
        console.warn(`  category fail ${url}: ${e.message}`)
        break
      }
    }
    console.log(`  category ${cat.url} → ${seen.size} handles`)
  }
  return map
}

async function mapPool(items, n, worker) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, () => run())
  )
  return results
}

function ulidLike() {
  // compact unique id compatible with other seed IDs
  const t = Date.now().toString(36).toUpperCase()
  const r = randomBytes(8).toString("hex").toUpperCase()
  return `01SCRAPE${t}${r}`.slice(0, 26)
}

const TAG_DEFS = [
  {
    name: "Eggless",
    slug: "eggless",
    description: "Prepared without eggs (Cake Break egg-free range).",
  },
  {
    name: "Vegan",
    slug: "vegan",
    description: "Plant-based recipe with no animal products.",
  },
  {
    name: "Dairy-free",
    slug: "dairy-free",
    description: "Made without dairy milk or butter.",
  },
  {
    name: "Gluten-free",
    slug: "gluten-free",
    description: "Made without gluten-containing grains.",
  },
  {
    name: "Halal",
    slug: "halal",
    description: "Halal-suitable preparation claim from source listing.",
  },
  {
    name: "Nut-free",
    slug: "nut-free",
    description: "Prepared without nuts (check kitchen cross-contact).",
  },
]

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("  Standalone scrape → Postgres backfill")
  console.log(`  dryRun=${dryRun} concurrency=${concurrency}`)
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  const pool = new pg.Pool({ connectionString: DATABASE_URL })

  // Ensure tags
  const tagByName = new Map()
  for (const def of TAG_DEFS) {
    const existing = await pool.query(
      `SELECT id, name, slug FROM dietary_tag WHERE slug=$1 AND deleted_at IS NULL LIMIT 1`,
      [def.slug]
    )
    if (existing.rows[0]) {
      tagByName.set(def.name, existing.rows[0])
    } else if (!dryRun) {
      const id = ulidLike()
      await pool.query(
        `INSERT INTO dietary_tag (id, name, slug, description, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,true,now(),now())`,
        [id, def.name, def.slug, def.description]
      )
      tagByName.set(def.name, { id, name: def.name, slug: def.slug })
      console.log(`  created tag ${def.name}`)
    } else {
      tagByName.set(def.name, { id: `dry_${def.slug}`, name: def.name, slug: def.slug })
    }
  }

  console.log("Scraping vegan category membership…")
  const categoryTags = await scrapeCategoryHandles()

  const prodRes = await pool.query(
    `SELECT id, title, handle, material, metadata, description
     FROM product
     WHERE deleted_at IS NULL
     ORDER BY created_at ASC
     ${limit ? `LIMIT ${limit}` : ""}`
  )
  const products = prodRes.rows
  console.log(`Products: ${products.length}`)

  const stats = {
    scrapedOk: 0,
    scrapedFail: 0,
    withIngredients: 0,
    withAllergens: 0,
    clearedIng: 0,
    clearedAll: 0,
    updated: 0,
    links: 0,
  }

  // existing links
  const linkRes = await pool.query(
    `SELECT product_id, dietary_tag_id FROM product_product_dietary_tag_dietary_tag WHERE deleted_at IS NULL`
  )
  const linked = new Set(
    linkRes.rows.map((r) => `${r.product_id}::${r.dietary_tag_id}`)
  )

  await mapPool(products, concurrency, async (product) => {
    const handle = normalizeHandle(product.handle)
    if (!handle) {
      stats.scrapedFail++
      return
    }
    if (delayMs) await sleep(delayMs)

    let page
    try {
      const html = await fetchHtml(`${BASE_URL}/${handle}`)
      page = parseProductHtml(html, handle)
      if (!page.ok) {
        stats.scrapedFail++
        console.warn(`  ✗ not product: ${handle}`)
        return
      }
      stats.scrapedOk++
    } catch (e) {
      stats.scrapedFail++
      console.warn(`  ✗ ${handle}: ${e.message}`)
      return
    }

    const cat = categoryTags.get(handle)
    if (cat) {
      for (const t of cat) {
        if (!page.dietaryNames.includes(t)) page.dietaryNames.push(t)
      }
    }

    if (page.ingredients) stats.withIngredients++
    if (page.allergens) stats.withAllergens++

    const prevMeta =
      product.metadata && typeof product.metadata === "object"
        ? { ...product.metadata }
        : {}
    const nextMeta = { ...prevMeta }

    let nextMaterial = product.material

    const prevIng =
      (typeof prevMeta.ingredients === "string" && prevMeta.ingredients) ||
      (typeof prevMeta.material === "string" && prevMeta.material) ||
      product.material ||
      ""

    if (page.ingredients) {
      nextMeta.ingredients = page.ingredients
      nextMeta.material = page.ingredients
      nextMaterial = page.ingredients
    } else if (
      isPlaceholderIngredients(prevIng) ||
      isPlaceholderIngredients(prevMeta.ingredients) ||
      isPlaceholderIngredients(prevMeta.material) ||
      isPlaceholderIngredients(product.material)
    ) {
      delete nextMeta.ingredients
      delete nextMeta.material
      nextMaterial = null
      stats.clearedIng++
    }

    if (page.allergens) {
      nextMeta.allergens = page.allergens
    } else if (isPlaceholderAllergens(prevMeta.allergens)) {
      delete nextMeta.allergens
      stats.clearedAll++
    }

    nextMeta.scraped_source = BASE_URL
    nextMeta.scraped_at = new Date().toISOString()
    nextMeta.scraped_dietary = page.dietaryNames
    if (page.overview) nextMeta.scraped_overview = page.overview
    if (page.metaDescription)
      nextMeta.scraped_meta_description = page.metaDescription

    // Prefer longest useful Magento copy: long description → meta → overview
    const descCandidates = [
      page.description,
      page.metaDescription,
      page.overview,
    ]
      .map((s) => (s || "").replace(/\s+/g, " ").trim())
      .filter(
        (s) =>
          s.length >= 20 &&
          !/^allergens?\s*:/i.test(s) &&
          s !== page.title &&
          s !== (page.title || "").replace(/^\([^)]+\)\s*/, "").trim()
      )
    descCandidates.sort((a, b) => b.length - a.length)
    const liveDesc = descCandidates[0] || ""
    const currentDesc = (product.description || "").trim()
    let nextDescription = product.description
    if (liveDesc && liveDesc.length > currentDesc.length) {
      nextDescription = liveDesc
    }

    stats.updated++
    console.log(
      `  ✓ ${handle} dietary=[${page.dietaryNames.join(", ")}] ing=${page.ingredients ? "Y" : "n"} all=${page.allergens ? "Y" : "n"}`
    )

    if (!dryRun) {
      await pool.query(
        `UPDATE product
         SET material = $2,
             metadata = $3::jsonb,
             description = $4,
             updated_at = now()
         WHERE id = $1`,
        [
          product.id,
          nextMaterial,
          JSON.stringify(nextMeta),
          nextDescription,
        ]
      )
    }

    for (const name of page.dietaryNames) {
      const tag = tagByName.get(name)
      if (!tag) continue
      const key = `${product.id}::${tag.id}`
      if (linked.has(key)) continue
      linked.add(key)
      stats.links++
      if (!dryRun && !String(tag.id).startsWith("dry_")) {
        try {
          await pool.query(
            `INSERT INTO product_product_dietary_tag_dietary_tag
               (product_id, dietary_tag_id, id, created_at, updated_at)
             VALUES ($1, $2, $3, now(), now())
             ON CONFLICT (product_id, dietary_tag_id) DO NOTHING`,
            [product.id, tag.id, ulidLike()]
          )
        } catch (e) {
          console.warn(`  link fail ${handle}→${name}: ${e.message}`)
        }
      }
    }
  })

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log(JSON.stringify(stats, null, 2))
  console.log(
    "Note: Magento product pages do not publish per-product ingredient/allergen lists."
  )
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // verify sample
  const sample = await pool.query(
    `SELECT handle, material, metadata->>'allergens' a, metadata->'scraped_dietary' d,
            (SELECT count(*) FROM product_product_dietary_tag_dietary_tag l WHERE l.product_id = p.id AND l.deleted_at IS NULL) tags
     FROM product p WHERE deleted_at IS NULL AND handle LIKE '%nk20%' LIMIT 3`
  )
  console.log("sample", sample.rows)

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
