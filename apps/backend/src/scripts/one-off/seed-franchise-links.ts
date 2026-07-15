import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * seed-franchise-links.ts
 * 
 * Standalone script to seed and link dummy products to specific franchises
 * for testing multi-tenant architecture.
 * 
 * Usage:
 *   npx medusa exec ./src/scripts/seed-franchise-links.ts
 * 
 * Or if using tsx with manual bootstrap:
 *   npx tsx src/scripts/seed-franchise-links.ts
 */

export default async function seedFranchiseLinks({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const franchiseService = container.resolve("franchise")
  const productService = container.resolve(Modules.PRODUCT)

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Franchise-Product Link Seeder")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // 1. Fetch at least 2 existing franchises
  let franchises = await franchiseService.listFranchises()

  if (franchises.length < 2) {
    logger.warn("Less than 2 franchises found. Using fallback mock IDs.")
    if (franchises.length === 0) {
      franchises = [
        { id: "franchise_mock_1", name: "Mock Franchise 1" } as any,
        { id: "franchise_mock_2", name: "Mock Franchise 2" } as any
      ]
    } else {
      franchises.push({ id: "franchise_mock_extra", name: "Mock Franchise 2" } as any)
    }
  }

  const franchise1 = franchises[0]
  const franchise2 = franchises[1]

  logger.info(`✓ Selected Franchise 1: ${franchise1.name || franchise1.id} (${franchise1.id})`)
  logger.info(`✓ Selected Franchise 2: ${franchise2.name || franchise2.id} (${franchise2.id})`)

  // 2. Fetch existing products
  const products = await productService.listProducts({})
  
  if (!products.length) {
    logger.error("❌ No products found in the database. Please seed products first.")
    return
  }

  logger.info(`\n📦 Found ${products.length} products. Splitting into groups...`)

  // 3. Split the products into two groups
  const midIndex = Math.max(1, Math.floor(products.length / 2))
  const groupA = products.slice(0, midIndex)
  const groupB = products.slice(midIndex)

  logger.info(`   Group A: ${groupA.length} products`)
  logger.info(`   Group B: ${groupB.length} products`)

  // Resolve the raw PG connection for direct cleanup of stale links.
  // We can't resolve "FranchiseProductLink" in exec mode — the link modules aren't registered
  // in the IoC container during script execution. Instead, we delete directly from the link table.
  const pgConnection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  // Helper: dismiss any existing franchise->product link before creating a new one.
  // Each product can only belong to ONE franchise (isList:true is only on the franchise side).
  // Without this, re-runs fail with "Cannot create multiple links between 'franchise' and 'product'".
  const linkProduct = async (franchiseId: string, productId: string): Promise<boolean> => {
    // Delete any existing franchise-product link row directly from the junction table.
    // Medusa's link table naming: {module1}_{entity1}_{module2}_{entity2}
    // franchise module + product module => "franchise_franchise_product_product"
    try {
      await pgConnection.raw(
        `DELETE FROM franchise_franchise_product_product WHERE product_id = ?`,
        [productId]
      )
    } catch (err) {
      // Table might not exist yet on first run — safe to skip
    }

    // Create the fresh link via the orchestrator remoteLink (handles event dispatch, etc.)
    await remoteLink.create({
      "franchise": { franchise_id: franchiseId },
      [Modules.PRODUCT]: { product_id: productId },
    })
    return true
  }

  // 4. Link Group A to Franchise 1
  logger.info(`\n🔗 Linking Group A to Franchise 1...`)
  let linkedA = 0
  for (const product of groupA) {
    try {
      await linkProduct(franchise1.id, product.id)
      linkedA++
      logger.info(`   ✓ Linked ${product.id} -> ${franchise1.id}`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`   ✗ Failed to link ${product.id}: ${msg}`)
    }
  }

  // 5. Link Group B to Franchise 2
  logger.info(`\n🔗 Linking Group B to Franchise 2...`)
  let linkedB = 0
  for (const product of groupB) {
    try {
      await linkProduct(franchise2.id, product.id)
      linkedB++
      logger.info(`   ✓ Linked ${product.id} -> ${franchise2.id}`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`   ✗ Failed to link ${product.id}: ${msg}`)
    }
  }

  logger.info("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  ✅ Seeding Complete!`)
  logger.info(`  Group A Links Created: ${linkedA}`)
  logger.info(`  Group B Links Created: ${linkedB}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
