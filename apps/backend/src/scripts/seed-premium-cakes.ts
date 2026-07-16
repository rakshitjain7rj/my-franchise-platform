import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createProductsWorkflow, createInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows"
import FranchiseProductLink from "../links/franchise-product"
import ProductDietaryTagLink from "../links/product-dietary-tag"

export default async function seedPremiumCakes({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const productService = container.resolve(Modules.PRODUCT) as any
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)
  const inventoryService = container.resolve(Modules.INVENTORY) as any
  const franchiseService = container.resolve("franchise") as any
  const dietaryTagService = container.resolve("dietary_tag") as any

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Premium Cakes Database Seeder (Scale Version)")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // 1. Resolve Active Franchise
  const existingFranchises = await franchiseService.listFranchises()
  if (existingFranchises.length === 0) {
    throw new Error("No active franchise found. Please seed the franchise first.")
  }
  const franchise = existingFranchises[0]
  logger.info(`✓ Target Franchise: ${franchise.name} (${franchise.id})`)

  // 2. Resolve Default Sales Channel
  const channels = await salesChannelService.listSalesChannels({
    name: "Default Sales Channel"
  })
  if (channels.length === 0) {
    throw new Error("Default Sales Channel not found.")
  }
  const salesChannelId = channels[0].id
  logger.info(`✓ Sales Channel: ${channels[0].name} (${salesChannelId})`)

  // 3. Resolve Shipping Profile
  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"]
  })
  if (shippingProfileResult.length === 0) {
    throw new Error("No shipping profile found.")
  }
  const shippingProfileId = shippingProfileResult[0].id
  logger.info(`✓ Shipping Profile ID: ${shippingProfileId}`)

  // 4. Resolve Stock Location
  const stockLocations = await stockLocationService.listStockLocations({}, { take: 1 })
  if (stockLocations.length === 0) {
    throw new Error("No stock locations found.")
  }
  const stockLocationId = stockLocations[0].id
  logger.info(`✓ Stock Location: ${stockLocations[0].name} (${stockLocationId})`)

  // 5. Resolve or Create Dietary Tag
  const [existingTag] = await dietaryTagService.listDietary_tags({ slug: "eggless" })
  const egglessDietaryTag = existingTag ?? await dietaryTagService.createDietary_tags({
    name: "Eggless",
    slug: "eggless",
    description: "Prepared without eggs. Uses plant-based binders.",
    is_active: true
  })
  logger.info(`✓ Dietary Tag: ${egglessDietaryTag.name} (${egglessDietaryTag.id})`)

  // 6. Clean Up Existing Products, Links & Inventory Items
  logger.info("\n🧹 Cleaning up existing products, links and inventory...")
  const { data: currentLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["franchise_id", "product_id"]
  })
  for (const link of currentLinks) {
    try {
      await remoteLink.dismiss({
        franchise: { franchise_id: link.franchise_id },
        [Modules.PRODUCT]: { product_id: link.product_id }
      })
    } catch (e: any) {
      logger.warn(`Failed to dismiss franchise link: ${e.message}`)
    }
  }

  const { data: currentTagLinks } = await query.graph({
    entity: ProductDietaryTagLink.entryPoint,
    fields: ["product_id", "dietary_tag_id"]
  })
  for (const link of currentTagLinks) {
    try {
      await remoteLink.dismiss({
        [Modules.PRODUCT]: { product_id: link.product_id },
        dietary_tag: { dietary_tag_id: link.dietary_tag_id }
      })
    } catch (e: any) {
      logger.warn(`Failed to dismiss dietary tag link: ${e.message}`)
    }
  }

  const existingProducts = await productService.listProducts({}, { take: 200 })
  if (existingProducts.length > 0) {
    const ids = existingProducts.map((p: any) => p.id)
    await productService.deleteProducts(ids)
    logger.info(`Deleted ${ids.length} old products.`)
  }

  const existingInventoryItems = await inventoryService.listInventoryItems({}, { take: 500 })
  if (existingInventoryItems.length > 0) {
    const invIds = existingInventoryItems.map((item: any) => item.id)
    await inventoryService.deleteInventoryItems(invIds)
    logger.info(`Deleted ${invIds.length} old inventory items.`)
  }

  // 7. Resolve and Seed Product Tags
  logger.info("\n🏷️ Setting up product tags...")
  const existingProductTags = await productService.listProductTags({}, { take: 100 })
  const tagMap = new Map<string, string>()
  for (const tag of existingProductTags) {
    tagMap.set(tag.value, tag.id)
  }

  const tagsToEnsure = [
    "Best Seller", "Classic", "Fruity", "Elegant", "Pure Vanilla",
    "Subtle", "Seasonal", "Fresh Fruit", "Caramel", "Crunchy",
    "Citrus", "Light", "Coffee", "Chocolate", "Nutty", "Exotic", "Rich", "Cheese"
  ]

  const tagsToCreate = tagsToEnsure.filter(t => !tagMap.has(t))
  if (tagsToCreate.length > 0) {
    const createdTags = await productService.createProductTags(tagsToCreate.map(v => ({ value: v })))
    for (const tag of createdTags) {
      tagMap.set(tag.value, tag.id)
    }
    logger.info(`Created ${tagsToCreate.length} new product tags.`)
  }

  const getTagRef = (name: string) => {
    const id = tagMap.get(name)
    if (!id) throw new Error(`Tag not registered: ${name}`)
    return { id }
  }

  // 8. Generate 120 Premium Cakes
  const unsplashImages = [
    "https://images.unsplash.com/photo-1616541823729-00fe0aacd32c?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1519869325930-281384150729?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1464349172961-10492ec8653e?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1535141192574-5d4897c13636?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1588195538326-c5b1e9f80a1b?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1557925923-cd4648e21187?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1524351199679-46cddf530c04?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1508737027454-e6454ef45afd?w=800&auto=format&fit=crop&q=80"
  ]

  const flavors = [
    { name: "Royal Belgian Chocolate", tags: ["Chocolate", "Rich"], imgIdx: 2 },
    { name: "Madagascar Bourbon Vanilla", tags: ["Pure Vanilla", "Subtle"], imgIdx: 11 },
    { name: "Zesty Sicilian Lemon", tags: ["Citrus", "Light"], imgIdx: 5 },
    { name: "Spiced Cinnamon Pecan", tags: ["Nutty", "Exotic"], imgIdx: 7 },
    { name: "Salted Butter Caramel", tags: ["Caramel", "Crunchy"], imgIdx: 4 },
    { name: "Wild Forest Blackberry", tags: ["Fruity", "Seasonal"], imgIdx: 1 },
    { name: "Turkish Hazelnut Praline", tags: ["Nutty", "Crunchy"], imgIdx: 8 },
    { name: "Organic Matcha Green Tea", tags: ["Exotic", "Light"], imgIdx: 9 },
    { name: "Rich Espresso Macchiato", tags: ["Coffee", "Rich"], imgIdx: 6 },
    { name: "Classic Cocoa Red Velvet", tags: ["Classic", "Best Seller"], imgIdx: 0 },
    { name: "Exotic Passionfruit Mango", tags: ["Fruity", "Exotic"], imgIdx: 3 },
    { name: "Creamy New York Cheese", tags: ["Cheese", "Rich"], imgIdx: 10 }
  ]

  const styles = [
    { name: "Classic Gateau", desc: "A traditional European style layered cake, moist and rich." },
    { name: "Layered Sponge Cake", desc: "Light, airy layers of sponge cake paired with delectable fillings." },
    { name: "Fudge Delight", desc: "A dense, rich, and intensely chocolatey experience with fudge frosting." },
    { name: "Decadent Mousse Cake", desc: "Featuring layers of smooth, airy cream mousse on a thin sponge base." },
    { name: "Silk Mirror Glaze", desc: "Stunning cake with a perfectly shiny glaze finish that looks like silk." },
    { name: "Crusted Cheesecake", desc: "A creamy baked cheesecake set on a buttery biscuit base." },
    { name: "Truffle Sensation", desc: "Filled and covered with a rich chocolate truffle filling." },
    { name: "Chantilly Cream Cake", desc: "Frosted with light, sweet vanilla whipped cream and pastry filling." },
    { name: "Elegant Crown Cake", desc: "Artfully decorated to resemble a royal crown, perfect for celebrations." },
    { name: "Velvet Tiered Cake", desc: "Elegant tiered presentation with a smooth, velvet texture finish." }
  ]

  const cakesData: any[] = []
  let cakeIndex = 1

  for (const flavor of flavors) {
    for (const style of styles) {
      const title = `${flavor.name} ${style.name}`
      const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      const description = `${style.desc} Infused with premium ${flavor.name.toLowerCase()} flavors, hand-crafted by our master bakers. Made using the finest ingredients and prepared fresh to order.`
      const subtitle = `A premium fusion of ${flavor.name} in a ${style.name.toLowerCase()}`
      const imgUrl = unsplashImages[flavor.imgIdx % unsplashImages.length]

      cakesData.push({
        title,
        handle,
        description,
        subtitle,
        thumbnail: imgUrl,
        images: [{ url: imgUrl }],
        weight: 1000,
        status: ProductStatus.PUBLISHED,
        shipping_profile_id: shippingProfileId,
        metadata: {
          supports_inscription: "true",
          // Photo upload for a subset of cakes (every 10th) — also enabled when
          // collection/type title contains "photo".
          supports_photo_upload: cakeIndex % 10 === 0 ? "true" : "false",
          // Per-product sponge flavours when the product has no Flavor option.
          supported_flavours: JSON.stringify([
            "Eggless Vanilla",
            "Eggless Chocolate",
            "Eggless Red Velvet",
            flavor.name,
          ]),
          // Size → servings mapping (product-detail derives from this).
          servings_map: JSON.stringify({
            "1kg": "8-10 servings",
            "2kg": "16-20 servings",
          }),
          allergens: flavor.name.includes("Pecan") || flavor.name.includes("Hazelnut") ? "Nuts, Gluten, Dairy" : "Gluten, Dairy",
          // Canonical key for storefront; material kept for legacy readers.
          ingredients: `Premium ${flavor.name} elements, Organic Flour, Cane Sugar, Sweet Butter.`,
          material: `Premium ${flavor.name} elements, Organic Flour, Cane Sugar, Sweet Butter.`,
          storage_serving: "Keep refrigerated. Best served fresh."
        },
        tags: flavor.tags.map(t => getTagRef(t)),
        options: [
          { title: "Size", values: ["1kg", "2kg"] }
        ],
        variants: [
          {
            title: "1kg",
            sku: `CK-${String(cakeIndex).padStart(3, "0")}-1KG`,
            options: { Size: "1kg" },
            metadata: { servings: "8-10 servings" },
            prices: [
              { amount: 35 + (cakeIndex % 15), currency_code: "usd" },
              { amount: 32 + (cakeIndex % 15), currency_code: "eur" }
            ],
            manage_inventory: true
          },
          {
            title: "2kg",
            sku: `CK-${String(cakeIndex).padStart(3, "0")}-2KG`,
            options: { Size: "2kg" },
            metadata: { servings: "16-20 servings" },
            prices: [
              { amount: 65 + (cakeIndex % 15) * 2, currency_code: "usd" },
              { amount: 60 + (cakeIndex % 15) * 2, currency_code: "eur" }
            ],
            manage_inventory: true
          }
        ],
        sales_channels: [{ id: salesChannelId }]
      })
      cakeIndex++
    }
  }

  logger.info(`\n🧁 Creating ${cakesData.length} premium cakes...`)
  const { result: createdProducts } = await createProductsWorkflow(container).run({
    input: {
      products: cakesData
    }
  })
  logger.info(`Successfully created ${createdProducts.length} premium products in Medusa database!`)

  // 9. Link Products to Franchise
  logger.info("\n🔗 Linking products to franchise...")
  const franchiseLinks = createdProducts.map((p: any) => ({
    franchise: { franchise_id: franchise.id },
    [Modules.PRODUCT]: { product_id: p.id }
  }))
  await remoteLink.create(franchiseLinks)
  logger.info(`✓ Linked all ${createdProducts.length} products to franchise ${franchise.name}`)

  // 10. Link Products to Sales Channel
  logger.info("\n🔗 Linking products to sales channel...")
  for (const product of createdProducts) {
    try {
      await remoteLink.create({
        [Modules.PRODUCT]: { product_id: product.id },
        [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId }
      })
    } catch (e: any) {
      logger.info(`  (Sales channel link already existed or managed for ${product.title})`)
    }
  }

  // 11. Link Eggless products to the custom Dietary Tag
  logger.info("\n🌱 Linking eggless products to the custom dietary tag...")
  let tagLinkCount = 0
  for (const product of createdProducts) {
    const hasEgglessOption = product.options.some((o: any) => 
      o.title === "Egg Version" && o.values?.some((v: any) => v.value === "Eggless")
    )
    if (hasEgglessOption) {
      try {
        await remoteLink.create({
          [Modules.PRODUCT]: { product_id: product.id },
          dietary_tag: { dietary_tag_id: egglessDietaryTag.id }
        })
        tagLinkCount++
      } catch (e: any) {
        logger.warn(`Could not link ${product.title} to custom dietary tag: ${e.message}`)
      }
    }
  }
  logger.info(`✓ Linked ${tagLinkCount} eggless products to dietary tag.`)

  // 12. Seed Inventory Levels
  logger.info("\n📦 Seeding inventory levels at the stock location...")
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"]
  })

  const newSkus = new Set<string>()
  for (const cake of cakesData) {
    for (const variant of cake.variants) {
      newSkus.add(variant.sku)
    }
  }

  const itemsToStock = inventoryItems.filter((item: any) => newSkus.has(item.sku))
  logger.info(`Found ${itemsToStock.length} inventory items to stock.`)

  if (itemsToStock.length > 0) {
    await createInventoryLevelsWorkflow(container).run({
      input: {
        inventory_levels: itemsToStock.map((item: any) => {
          return {
            location_id: stockLocationId,
            stocked_quantity: 50,
            inventory_item_id: item.id
          }
        })
      }
    })
    logger.info(`✓ Successfully stocked all ${itemsToStock.length} variants at location ${stockLocationId}!`)
  }

  logger.info("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  🎉 Database Seeding Complete! ${cakesData.length} Real Cakes Loaded!`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
}
