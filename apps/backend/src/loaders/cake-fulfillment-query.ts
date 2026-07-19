/**
 * Binds the app-level Medusa Query into the cake fulfillment provider bridge.
 * Runs once on Medusa boot with the full container (not the narrow provider cradle).
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  bindCakeFulfillmentQuery,
  type GraphQuery,
} from "../modules/cake-fulfillment/query-bridge"

export default async function cakeFulfillmentQueryLoader({
  container,
}: {
  container: MedusaContainer
}) {
  try {
    const query = container.resolve(
      ContainerRegistrationKeys.QUERY
    ) as GraphQuery
    bindCakeFulfillmentQuery(query)
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as {
      info: (m: string) => void
    }
    logger.info(
      "[cake-fulfillment] Bound app Query for calculated delivery pricing"
    )
  } catch (err) {
    // Non-fatal at boot — provider will fall back to franchise/SQL paths.
    console.warn(
      "[cake-fulfillment] Could not bind Query at boot:",
      err instanceof Error ? err.message : err
    )
  }
}
