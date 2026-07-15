import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import FranchiseProductLink from "../links/franchise-product";
import FranchiseStoreLink from "../links/franchise-store";

export default async function seedAllFranchises({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const remoteLink = container.resolve("remoteLink");
  const franchiseService = container.resolve("franchise") as any;
  const pgConnection = container.resolve("__pg_connection__") as any;

  logger.info("Starting custom franchise and store location link seeder...");

  // 1. Ensure the default franchise exists
  const defaultFranchiseId = "fran_01KX3A21FPJKNT13V32C72RS2P";
  let defaultFranchise;
  try {
    defaultFranchise = await franchiseService.retrieveFranchise(defaultFranchiseId);
    logger.info(`Found existing default franchise: ${defaultFranchise.id}`);
  } catch {
    defaultFranchise = await franchiseService.createFranchises({
      id: defaultFranchiseId,
      name: "Flagship Cakery Birmingham",
      code: "BHM",
      is_active: true,
    });
    logger.info(`Created default franchise: ${defaultFranchise.id}`);
  }

  // 2. Raw SQL cleanup to avoid ORM foreign key errors
  try {
    logger.info("Performing raw SQL database cleanup of other franchises...");
    await pgConnection.raw("DELETE FROM link_franchise_product WHERE franchise_id != ?", [defaultFranchiseId]);
    await pgConnection.raw("DELETE FROM link_franchise_store WHERE franchise_id != ?", [defaultFranchiseId]);
    await pgConnection.raw("DELETE FROM franchise WHERE id != ?", [defaultFranchiseId]);
    logger.info("Raw SQL cleanup completed successfully!");
  } catch (err: any) {
    logger.error(`Raw SQL cleanup failed: ${err.message}`);
  }

  // 3. Link all products to the default franchise
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id"],
  });

  for (const product of products) {
    if (!product.id) continue;
    // Dismiss any existing links to be safe
    try {
      await remoteLink.dismiss([{
        [Modules.PRODUCT]: { product_id: product.id },
      }]);
    } catch {}
    
    // Create new link to default franchise
    try {
      await remoteLink.create({
        franchise: { franchise_id: defaultFranchise.id },
        [Modules.PRODUCT]: { product_id: product.id },
      });
      logger.info(`Linked product ${product.id} to default franchise.`);
    } catch (err: any) {
      logger.warn(`Failed to link product ${product.id}: ${err.message}`);
    }
  }

  // 4. Ensure store exists and is linked
  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["id"],
  });
  const storeId = stores?.[0]?.id;
  if (storeId) {
    try {
      await remoteLink.dismiss([{
        [Modules.STORE]: { store_id: storeId },
      }]);
    } catch {}
    
    try {
      await remoteLink.create({
        franchise: { franchise_id: defaultFranchise.id },
        [Modules.STORE]: { store_id: storeId },
      });
      logger.info(`Linked store ${storeId} to default franchise.`);
    } catch (err: any) {
      logger.warn(`Failed to link store ${storeId}: ${err.message}`);
    }
  }

  logger.info("Custom seeding successfully completed!");
}
