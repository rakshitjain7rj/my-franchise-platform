/**
 * delete-medusa-demo-products.ts
 *
 * Removes the stock Medusa demo/seed products (Sweatshirt, Sweatpants,
 * Shorts, T-Shirt, etc.) that ship with `medusa db:migrate` + default
 * seeding and aren't part of the real cake catalogue.
 *
 * Uses `deleteProductsWorkflow` (not a raw module delete) so franchise,
 * sales-channel, and inventory links are cleaned up correctly.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/one-off/delete-medusa-demo-products.ts
 */

import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows";

const DEMO_PRODUCT_TITLES = [
  "Medusa Sweatshirt",
  "Medusa Sweatpants",
  "Medusa Shorts",
  "Medusa T-Shirt",
];

export default async function deleteMedusaDemoProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title"],
    filters: { title: DEMO_PRODUCT_TITLES },
  });

  if (!products.length) {
    logger.info("No Medusa demo products found — nothing to delete.");
    return;
  }

  logger.info(`Deleting ${products.length} demo product(s): ${products.map((p: any) => p.title).join(", ")}`);

  await deleteProductsWorkflow(container).run({
    input: { ids: products.map((p: any) => p.id) },
  });

  logger.info("Done.");
}
