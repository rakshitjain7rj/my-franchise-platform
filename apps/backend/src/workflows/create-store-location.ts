/**
 * createStoreLocationWorkflow
 *
 * Atomic, compensatable workflow that provisions a fully-wired store location:
 *
 *   1. Create the StoreLocation row (custom franchise module)
 *   2. Create a shadow StockLocation (Medusa core)
 *   3. Link StoreLocation ↔ StockLocation (Medusa Link Engine)
 *   4. Associate StockLocation with the franchise's SalesChannel(s)
 *
 * If any step fails, all previous steps roll back automatically.
 *
 * This replaces the old pattern of:
 *   POST /admin/franchise-locations → bare createStoreLocations()
 *   POST /admin/link-stores         → fuzzy-match backfill
 */

import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import FranchiseSalesChannelLink from "../links/franchise-sales-channel"
import { DEFAULT_OPENING_HOURS } from "../utils/logistics"

// ─── Input / Output Types ───────────────────────────────────────────────────

export interface CreateStoreLocationWorkflowInput {
  name: string
  code: string
  franchise_id: string
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  is_active?: boolean
  is_accepting_orders?: boolean
  custom_lead_time_hours?: number
  daily_order_capacity?: number
  opening_hours?: Record<string, any> | null
  metadata?: Record<string, any> | null
}

// ─── Step 1: Create StoreLocation ───────────────────────────────────────────

const createStoreLocationStep = createStep(
  "create-store-location-step",
  async (
    input: CreateStoreLocationWorkflowInput,
    { container }
  ) => {
    const franchiseService = container.resolve<any>("franchise")
    const logger = container.resolve("logger")

    const [storeLocation] = await franchiseService.createStoreLocations([
      {
        name: input.name,
        code: input.code,
        franchise_id: input.franchise_id,
        address: input.address ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        is_active: input.is_active ?? true,
        is_accepting_orders: input.is_accepting_orders ?? true,
        custom_lead_time_hours: input.custom_lead_time_hours ?? 24,
        daily_order_capacity: input.daily_order_capacity ?? 10,
        // Single source of truth: utils/logistics DEFAULT_OPENING_HOURS.
        // Never leave this null — slots API used to return [] when null.
        opening_hours: input.opening_hours ?? DEFAULT_OPENING_HOURS,
        metadata: input.metadata ?? {},
      },
    ])

    logger.info(
      `[create-store-location] ✓ Step 1: Created StoreLocation ${storeLocation.id} (${storeLocation.code})`
    )

    return new StepResponse(storeLocation, storeLocation.id)
  },
  // Compensation: delete the StoreLocation
  async (storeLocationId, { container }) => {
    if (!storeLocationId) return

    const franchiseService = container.resolve<any>("franchise")
    const logger = container.resolve("logger")

    await franchiseService.deleteStoreLocations([storeLocationId])
    logger.info(
      `[create-store-location] ↺ Rolled back StoreLocation ${storeLocationId}`
    )
  }
)

// ─── Step 2: Create shadow StockLocation ────────────────────────────────────

type StockLocationStepInput = {
  name: string
  address?: string | null
}

const createShadowStockLocationStep = createStep(
  "create-shadow-stock-location-step",
  async (input: StockLocationStepInput, { container }) => {
    const logger = container.resolve("logger")

    const { result: stockLocations } = await createStockLocationsWorkflow(
      container
    ).run({
      input: {
        locations: [
          {
            name: input.name,
            address: input.address ?? undefined,
            metadata: { auto_provisioned: true },
          },
        ],
      },
    })

    const stockLocation = stockLocations[0]

    // Enable fulfillment providers on the new stock location so shipping
    // options (manual flat pickup + cake calculated delivery) can serve it.
    const remoteLink = container.resolve(ContainerRegistrationKeys.REMOTE_LINK)
    for (const providerId of ["manual_manual", "cake_cake"]) {
      try {
        await remoteLink.create({
          [Modules.STOCK_LOCATION]: {
            stock_location_id: stockLocation.id,
          },
          [Modules.FULFILLMENT]: {
            fulfillment_provider_id: providerId,
          },
        })
      } catch {
        // provider may already be linked or not yet registered
      }
    }

    logger.info(
      `[create-store-location] ✓ Step 2: Created StockLocation ${stockLocation.id} ("${stockLocation.name}")`
    )

    return new StepResponse(stockLocation, stockLocation.id)
  },
  // Compensation: delete the StockLocation via Medusa's core workflow
  async (stockLocationId, { container }) => {
    if (!stockLocationId) return

    const logger = container.resolve("logger")
    const { deleteStockLocationsWorkflow } = await import(
      "@medusajs/medusa/core-flows"
    )

    await deleteStockLocationsWorkflow(container).run({
      input: { ids: [stockLocationId] },
    })
    logger.info(
      `[create-store-location] ↺ Rolled back StockLocation ${stockLocationId}`
    )
  }
)

// ─── Step 3: Link StoreLocation ↔ StockLocation ────────────────────────────

type LinkStepInput = {
  store_location_id: string
  stock_location_id: string
}

const linkStoreToStockStep = createStep(
  "link-store-to-stock-step",
  async (input: LinkStepInput, { container }) => {
    const remoteLink = container.resolve<any>(
      ContainerRegistrationKeys.REMOTE_LINK
    )
    const logger = container.resolve("logger")

    const linkData = {
      franchise: {
        store_location_id: input.store_location_id,
      },
      [Modules.STOCK_LOCATION]: {
        stock_location_id: input.stock_location_id,
      },
    }

    await remoteLink.create(linkData)

    logger.info(
      `[create-store-location] ✓ Step 3: Linked StoreLocation ${input.store_location_id} ↔ StockLocation ${input.stock_location_id}`
    )

    return new StepResponse(linkData, linkData)
  },
  // Compensation: dismiss the link
  async (linkData, { container }) => {
    if (!linkData) return

    const remoteLink = container.resolve<any>(
      ContainerRegistrationKeys.REMOTE_LINK
    )
    const logger = container.resolve("logger")

    await remoteLink.dismiss(linkData)
    logger.info(
      `[create-store-location] ↺ Rolled back StoreLocation ↔ StockLocation link`
    )
  }
)

// ─── Step 4: Associate StockLocation with franchise's SalesChannel(s) ──────

type SalesChannelLinkInput = {
  franchise_id: string
  stock_location_id: string
}

const linkStockToSalesChannelsStep = createStep(
  "link-stock-to-sales-channels-step",
  async (input: SalesChannelLinkInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve("logger")

    // Resolve the franchise's sales channel IDs
    const { data: scLinks } = await query.graph({
      entity: FranchiseSalesChannelLink.entryPoint,
      fields: ["sales_channel_id"],
      filters: { franchise_id: input.franchise_id },
    })

    const salesChannelIds = Array.from(
      new Set(
        (scLinks as Array<{ sales_channel_id?: string }>)
          .map((l) => l.sales_channel_id)
          .filter((id): id is string => Boolean(id))
      )
    )

    if (!salesChannelIds.length) {
      logger.warn(
        `[create-store-location] ⚠ Step 4: No sales channels linked to franchise ${input.franchise_id} — ` +
          `skipping sales-channel ↔ stock-location association. ` +
          `The stock location will need to be manually associated later.`
      )
      return new StepResponse(
        { linked: false, sales_channel_ids: [] },
        null
      )
    }

    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: input.stock_location_id,
        add: salesChannelIds,
      },
    })

    logger.info(
      `[create-store-location] ✓ Step 4: Associated StockLocation ${input.stock_location_id} with ${salesChannelIds.length} sales channel(s)`
    )

    return new StepResponse(
      { linked: true, sales_channel_ids: salesChannelIds },
      { stock_location_id: input.stock_location_id, sales_channel_ids: salesChannelIds }
    )
  },
  // Compensation: remove the sales channel associations
  async (compensationData, { container }) => {
    if (!compensationData) return

    const logger = container.resolve("logger")
    const { stock_location_id, sales_channel_ids } = compensationData as {
      stock_location_id: string
      sales_channel_ids: string[]
    }

    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: stock_location_id,
        remove: sales_channel_ids,
      },
    })

    logger.info(
      `[create-store-location] ↺ Rolled back sales-channel associations for StockLocation ${stock_location_id}`
    )
  }
)

// ─── Workflow ───────────────────────────────────────────────────────────────

export const createStoreLocationWorkflowId = "create-store-location-workflow"

export const createStoreLocationWorkflow = createWorkflow(
  createStoreLocationWorkflowId,
  (input: CreateStoreLocationWorkflowInput) => {
    // Step 1: Create the StoreLocation
    const storeLocation = createStoreLocationStep(input)

    // Step 2: Create a shadow StockLocation with the same name/address
    const stockLocation = createShadowStockLocationStep({
      name: input.name,
      address: input.address,
    })

    // Step 3: Link them together
    linkStoreToStockStep({
      store_location_id: storeLocation.id,
      stock_location_id: stockLocation.id,
    })

    // Step 4: Associate the stock location with the franchise's sales channels
    linkStockToSalesChannelsStep({
      franchise_id: input.franchise_id,
      stock_location_id: stockLocation.id,
    })

    return new WorkflowResponse({
      store_location: storeLocation,
      stock_location: stockLocation,
    })
  }
)
