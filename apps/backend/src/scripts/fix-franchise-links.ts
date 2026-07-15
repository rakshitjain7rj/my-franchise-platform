import { ExecArgs } from "@medusajs/framework/types"

export default async function fixFranchiseLinks({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const pgConnection = container.resolve("__pg_connection__")
  
  const fromId = "fran_01KWKB6ET5SHWPTRP07DN0QPQS"
  const toId = "fran_01KX3A21FPJKNT13V32C72RS2P"

  logger.info(`Starting link correction from ${fromId} to ${toId}...`)

  try {
    // Ensure default franchise exists
    const franchiseExists = await pgConnection.raw("SELECT id FROM franchise WHERE id = ?", [toId])
    if (franchiseExists.rows.length === 0) {
      await pgConnection.raw("INSERT INTO franchise (id, name, code, is_active, created_at, updated_at) VALUES (?, 'Flagship Cakery Birmingham', 'BHM', true, NOW(), NOW())", [toId])
      logger.info(`Created default franchise ${toId}`)
    }

    // Update store locations first to satisfy foreign keys
    const locUpdates = await pgConnection.raw(
      "UPDATE store_location SET franchise_id = ? WHERE franchise_id = ?",
      [toId, fromId]
    )
    logger.info(`Updated ${locUpdates.rowCount} store locations.`)

    // Update product links
    const productUpdates = await pgConnection.raw(
      "UPDATE franchise_franchise_product_product SET franchise_id = ? WHERE franchise_id = ?",
      [toId, fromId]
    )
    logger.info(`Updated ${productUpdates.rowCount} product links.`)

    // Update store links
    const storeUpdates = await pgConnection.raw(
      "UPDATE franchise_franchise_store_store SET franchise_id = ? WHERE franchise_id = ?",
      [toId, fromId]
    )
    logger.info(`Updated ${storeUpdates.rowCount} store links.`)

    // Update sales channel links
    const scUpdates = await pgConnection.raw(
      "UPDATE franchise_franchise_sales_channel_sales_channel SET franchise_id = ? WHERE franchise_id = ?",
      [toId, fromId]
    )
    logger.info(`Updated ${scUpdates.rowCount} sales channel links.`)

    // Delete old franchise
    const delResult = await pgConnection.raw("DELETE FROM franchise WHERE id = ?", [fromId])
    logger.info(`Deleted old franchise row count: ${delResult.rowCount}`)

    logger.info("Link correction completed successfully!")
  } catch (err: any) {
    logger.error(`Error during link correction: ${err.message}`)
  }
}
