import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import FranchiseProductLink from "../links/franchise-product"
import ProductDietaryTagLink from "../links/product-dietary-tag"

export default async function seedCatalogue({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")

  const franchiseService = container.resolve("franchise")
  const dietaryTagService = container.resolve("dietary_tag")
  const productService = container.resolve(Modules.PRODUCT)

  const existingFranchises = await franchiseService.listFranchises()
  const franchise = existingFranchises[0]

  if (!franchise) {
    logger.error("No franchise found. Run the franchise seed first.")
    return
  }

  const [existingTag] = await dietaryTagService.listDietary_tags({
    slug: "eggless",
  })

  const dietaryTag =
    existingTag ??
    (await dietaryTagService.createDietary_tags({
      name: "Eggless",
      slug: "eggless",
      description: "Prepared without eggs. Uses plant-based binders.",
      is_active: true,
    }))

  const [existingProduct] = await productService.listProducts({
    handle: "eggless-festival-cake",
  })

  const product =
    existingProduct ??
    (await productService.createProducts({
      title: "Eggless Festival Cake",
      handle: "eggless-festival-cake",
      description:
        "A celebratory, eggless cake with customizable tiers and flavors.",
      options: [
        {
          title: "Weight",
          values: ["1kg", "2kg"],
        },
        {
          title: "Flavor",
          values: ["Vanilla", "Chocolate"],
        },
      ],
      variants: [
        {
          title: "1kg Vanilla",
          sku: "CAKE-EGGLESS-1KG-VAN",
          options: {
            Weight: "1kg",
            Flavor: "Vanilla",
          },
          metadata: {
            lead_time_days: 2,
            servings: "8-10 servings",
          },
        },
        {
          title: "1kg Chocolate",
          sku: "CAKE-EGGLESS-1KG-CHO",
          options: {
            Weight: "1kg",
            Flavor: "Chocolate",
          },
          metadata: {
            lead_time_days: 2,
            servings: "8-10 servings",
          },
        },
        {
          title: "2kg Vanilla",
          sku: "CAKE-EGGLESS-2KG-VAN",
          options: {
            Weight: "2kg",
            Flavor: "Vanilla",
          },
          metadata: {
            lead_time_days: 3,
            servings: "16-20 servings",
          },
        },
        {
          title: "2kg Chocolate",
          sku: "CAKE-EGGLESS-2KG-CHO",
          options: {
            Weight: "2kg",
            Flavor: "Chocolate",
          },
          metadata: {
            lead_time_days: 3,
            servings: "16-20 servings",
          },
        },
      ],
      metadata: {
        is_perishable: true,
        shelf_life_days: 2,
        supports_inscription: "true",
        supports_photo_upload: "false",
        servings_map: JSON.stringify({
          "1kg": "8-10 servings",
          "2kg": "16-20 servings",
        }),
        allergens: "Gluten, Dairy",
        ingredients:
          "Flour, Sugar, Butter, Milk, Cocoa, Raising agents, Natural flavourings",
        storage_serving:
          "Keep refrigerated and consume within 2 days. Bring to room temperature before serving.",
      },
    }))

  const { data: existingFranchiseProductLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: { franchise_id: franchise.id, product_id: product.id },
  })

  if (!existingFranchiseProductLinks.length) {
    await remoteLink.create({
      franchise: { franchise_id: franchise.id },
      [Modules.PRODUCT]: { product_id: product.id },
    })
  }

  const { data: existingProductTagLinks } = await query.graph({
    entity: ProductDietaryTagLink.entryPoint,
    fields: ["dietary_tag_id"],
    filters: { product_id: product.id, dietary_tag_id: dietaryTag.id },
  })

  if (!existingProductTagLinks.length) {
    await remoteLink.create({
      [Modules.PRODUCT]: { product_id: product.id },
      dietary_tag: { dietary_tag_id: dietaryTag.id },
    })
  }

  logger.info(
    `Seeded catalogue product ${product.id} with dietary tag ${dietaryTag.id}.`
  )
}
