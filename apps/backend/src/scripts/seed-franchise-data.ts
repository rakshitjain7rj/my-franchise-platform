import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createSalesChannelsWorkflow,
  createStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import FranchiseProductLink from "../links/franchise-product";
import FranchiseSalesChannelLink from "../links/franchise-sales-channel";
import FranchiseStoreLink from "../links/franchise-store";

const DEFAULT_FRANCHISE = {
  name: "Flagship Cakery",
  code: "FLAGSHIP_01",
};

const DEFAULT_STORE = {
  name: "Flagship Store",
  supported_currencies: [
    {
      currency_code: "gbp", // Set to GBP to match your store
      is_default: true,
    },
  ],
};

export default async function seedFranchiseData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const remoteLink = container.resolve("remoteLink");
  const franchiseService = container.resolve("franchise");

  logger.info("Starting franchise seed...");

  const existingFranchises = await franchiseService.listFranchises();
  const franchise =
    existingFranchises[0] ??
    (await franchiseService.createFranchises(DEFAULT_FRANCHISE));

  logger.info(`Using Franchise ID: ${franchise.id}`);

  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
    filters: { name: "Default Sales Channel" },
  });

  let salesChannelId = salesChannels?.[0]?.id as string | undefined;

  if (!salesChannelId) {
    const { result: createdSalesChannels } =
      await createSalesChannelsWorkflow(container).run({
        input: {
          salesChannelsData: [
            {
              name: "Default Sales Channel",
              description: "Created by franchise seed script",
            },
          ],
        },
      });

    salesChannelId = createdSalesChannels[0].id;
  }

  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["id", "name"],
  });

  let storeId = stores?.[0]?.id as string | undefined;

  if (!storeId) {
    const { result: createdStores } = await createStoresWorkflow(container).run({
      input: {
        stores: [
          {
            ...DEFAULT_STORE,
            default_sales_channel_id: salesChannelId,
          },
        ],
      },
    });

    storeId = createdStores[0].id;
    logger.info(`Created store: ${storeId}`);
  }

  if (storeId) {
    const { data: storeLinks } = await query.graph({
      entity: FranchiseStoreLink.entryPoint,
      fields: ["store_id"],
      filters: { franchise_id: franchise.id, store_id: storeId },
    });

    if (!storeLinks.length) {
      // FIX 1: franchise is placed FIRST
      await remoteLink.create({
        franchise: { franchise_id: franchise.id },
        [Modules.STORE]: { store_id: storeId },
      });
      logger.info(`Linked store ${storeId} to franchise.`);
    }
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id"],
  });

  const { data: existingProductLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: { franchise_id: franchise.id },
  });

  const linkedProductIds = new Set(
    existingProductLinks
      .map((link: { product_id?: string }) => link.product_id)
      .filter((productId): productId is string => Boolean(productId))
  );

  for (const product of products) {
    if (!product.id || linkedProductIds.has(product.id)) {
      continue;
    }

    // FIX 2: franchise is placed FIRST
    await remoteLink.create({
      franchise: { franchise_id: franchise.id },
      [Modules.PRODUCT]: { product_id: product.id },
    });
    logger.info(`Linked product ${product.id} to franchise.`);
  }

  logger.info("Finished executing franchise seed.");
}