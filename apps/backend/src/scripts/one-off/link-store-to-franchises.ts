import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStoresWorkflow } from "@medusajs/medusa/core-flows"
import FranchiseStoreLink from "../../links/franchise-store"

export default async function linkStoreToFranchises({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Franchise-Store Link and Creation Seeder")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // 1. Fetch the default sales channel to use for new stores
  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
    filters: { name: "Default Sales Channel" },
  })

  const salesChannelId = salesChannels?.[0]?.id as string | undefined
  logger.info(`✓ Default Sales Channel ID: ${salesChannelId ?? "None"}`)

  // 2. Fetch all franchises
  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id", "name"],
  })

  logger.info(`✓ Found ${franchises.length} total franchises in the database.`)

  // 3. For each franchise, ensure it has a linked store
  let createdCount = 0
  let linkedCount = 0

  for (const franchise of franchises) {
    logger.info(`Checking store link for: ${franchise.name} (${franchise.id})...`)

    // Check if it already has a store link
    const { data: storeLinks } = await query.graph({
      entity: FranchiseStoreLink.entryPoint,
      fields: ["store_id"],
      filters: { franchise_id: franchise.id },
    })

    if (storeLinks.length > 0) {
      logger.info(`  - Already linked to store: ${storeLinks[0].store_id}`)
      continue
    }

    // Since it doesn't have a linked store, create a new Store record for this franchise
    logger.info(`  - Creating a new unique store for ${franchise.name}...`)

    const storeName = `${franchise.name} Store`
    
    try {
      const { result: createdStores } = await createStoresWorkflow(container).run({
        input: {
          stores: [
            {
              name: storeName,
              supported_currencies: [
                {
                  currency_code: "inr", // default to INR matching the catalogue price format
                  is_default: true,
                },
              ],
              default_sales_channel_id: salesChannelId,
            },
          ],
        },
      })

      const newStoreId = createdStores[0].id
      logger.info(`  - Created store successfully: ${newStoreId}`)
      createdCount++

      // Create the link in the join table
      await remoteLink.create({
        franchise: { franchise_id: franchise.id },
        [Modules.STORE]: { store_id: newStoreId },
      })

      logger.info(`  - Linked store ${newStoreId} -> ${franchise.name} (${franchise.id})`)
      linkedCount++
    } catch (err: any) {
      logger.error(`  - Failed to create/link store for ${franchise.name}: ${err.message}`)
    }
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  ✅ Complete! Created ${createdCount} stores and linked ${linkedCount} stores.`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

export const config = {}
