/**
 * backfill-inventory-items.ts
 *
 * Repairs variants that were created outside `createProductVariantsWorkflow`
 * (e.g. by `import-live-catalogue.ts` before it was fixed to handle inventory
 * itself) and therefore have NO inventory item at all. Such variants resolve
 * to `inventory_quantity: null` on the storefront, which `isProductAvailable()`
 * treats as out of stock — the product renders grayed out with an
 * "Unavailable" badge even though it's a real, sellable product.
 *
 * For every managed-inventory variant with no inventory item, this script:
 *   1. Creates an inventory item (sku/title copied from the variant).
 *   2. Links it to the variant via the core product<->inventory link.
 *   3. Creates an inventory level at every stock location belonging to the
 *      variant's product's franchise, stocked at BACKFILL_STOCK_QTY.
 *
 * Idempotent: only touches variants that currently have zero inventory items.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/one-off/backfill-inventory-items.ts
 *
 * Env overrides:
 *   BACKFILL_STOCK_QTY  (default: 50)
 */

import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import FranchiseProductLink from "../../links/franchise-product";
import StoreLocationStockLocationLink from "../../links/store-location-stock-location";

const BACKFILL_STOCK_QTY = process.env.BACKFILL_STOCK_QTY
  ? parseInt(process.env.BACKFILL_STOCK_QTY, 10)
  : 50;

export default async function backfillInventoryItems({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const remoteLink = container.resolve("remoteLink");
  const inventoryService = container.resolve(Modules.INVENTORY);
  const franchiseService = container.resolve("franchise") as {
    listStoreLocations: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ id: string }>>;
  };

  logger.info(`Backfilling inventory items at qty=${BACKFILL_STOCK_QTY}...`);

  // 1. Find every managed-inventory variant with zero inventory items.
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "title", "manage_inventory", "product_id", "inventory_items.id"],
  });

  type VariantRow = {
    id: string;
    sku?: string | null;
    title?: string | null;
    manage_inventory?: boolean;
    product_id?: string;
    inventory_items?: Array<{ id?: string }>;
  };

  const orphanVariants = (variants as VariantRow[]).filter(
    (v) => v.manage_inventory !== false && !(v.inventory_items ?? []).length
  );

  if (!orphanVariants.length) {
    logger.info("No orphan variants found — nothing to backfill.");
    return;
  }
  logger.info(`Found ${orphanVariants.length} variant(s) with no inventory item.`);

  // 2. Resolve product -> franchise -> store locations -> stock locations,
  //    caching per franchise so we don't re-resolve for every variant.
  const productIds = Array.from(new Set(orphanVariants.map((v) => v.product_id).filter(Boolean))) as string[];

  const { data: franchiseLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["franchise_id", "product_id"],
    filters: { product_id: productIds },
  });
  const productToFranchise = new Map<string, string>();
  for (const link of franchiseLinks as Array<{ franchise_id?: string; product_id?: string }>) {
    if (link.product_id && link.franchise_id) {
      productToFranchise.set(link.product_id, link.franchise_id);
    }
  }

  const franchiseToStockLocations = new Map<string, string[]>();
  const resolveStockLocations = async (franchiseId: string): Promise<string[]> => {
    if (franchiseToStockLocations.has(franchiseId)) {
      return franchiseToStockLocations.get(franchiseId)!;
    }
    const storeLocations = await franchiseService.listStoreLocations(
      { franchise_id: franchiseId },
      { select: ["id"] }
    );
    const storeLocationIds = storeLocations.map((sl) => sl.id);
    let stockLocationIds: string[] = [];
    if (storeLocationIds.length) {
      const { data: stockLinks } = await query.graph({
        entity: StoreLocationStockLocationLink.entryPoint,
        fields: ["stock_location_id"],
        filters: { store_location_id: storeLocationIds },
      });
      stockLocationIds = Array.from(
        new Set(
          (stockLinks as Array<{ stock_location_id?: string }>)
            .map((l) => l.stock_location_id)
            .filter((id): id is string => Boolean(id))
        )
      );
    }
    franchiseToStockLocations.set(franchiseId, stockLocationIds);
    return stockLocationIds;
  };

  // 3. Process in batches to keep the create calls reasonably sized.
  const BATCH_SIZE = 100;
  let itemsCreated = 0;
  let levelsCreated = 0;
  let skippedNoStockLocation = 0;

  for (let i = 0; i < orphanVariants.length; i += BATCH_SIZE) {
    const batch = orphanVariants.slice(i, i + BATCH_SIZE);

    const createdItems = await inventoryService.createInventoryItems(
      batch.map((v) => ({ sku: v.sku ?? undefined, title: v.title ?? undefined }))
    );
    itemsCreated += createdItems.length;

    const variantInventoryLinks = batch.map((v, index) => ({
      [Modules.PRODUCT]: { variant_id: v.id },
      [Modules.INVENTORY]: { inventory_item_id: createdItems[index].id },
      data: { required_quantity: 1 },
    }));
    await remoteLink.create(variantInventoryLinks);

    const levelsToCreate: Array<{
      inventory_item_id: string;
      location_id: string;
      stocked_quantity: number;
    }> = [];

    for (let j = 0; j < batch.length; j++) {
      const franchiseId = batch[j].product_id ? productToFranchise.get(batch[j].product_id!) : undefined;
      if (!franchiseId) {
        skippedNoStockLocation++;
        continue;
      }
      const stockLocationIds = await resolveStockLocations(franchiseId);
      if (!stockLocationIds.length) {
        skippedNoStockLocation++;
        continue;
      }
      for (const stockLocationId of stockLocationIds) {
        levelsToCreate.push({
          inventory_item_id: createdItems[j].id,
          location_id: stockLocationId,
          stocked_quantity: BACKFILL_STOCK_QTY,
        });
      }
    }

    if (levelsToCreate.length) {
      await inventoryService.createInventoryLevels(levelsToCreate);
      levelsCreated += levelsToCreate.length;
    }

    logger.info(
      `  → Processed ${Math.min(i + BATCH_SIZE, orphanVariants.length)}/${orphanVariants.length} variants`
    );
  }

  logger.info(
    `Done. Created ${itemsCreated} inventory item(s), ${levelsCreated} inventory level(s) at qty=${BACKFILL_STOCK_QTY}. ` +
      `${skippedNoStockLocation} variant(s) skipped (product has no resolvable franchise stock location).`
  );
}
