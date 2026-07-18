/**
 * createStoreLocationWorkflow
 *
 * Atomic, compensatable workflow that provisions a fully-wired store location:
 *
 *   0. Assert franchise has at least one sales channel (fail closed — no orphan rows)
 *   1. Create the StoreLocation row (custom franchise module)
 *   2. Create a shadow StockLocation (Medusa core) + required fulfillment providers
 *   3. Link StoreLocation ↔ StockLocation (Medusa Link Engine)
 *   4. Associate StockLocation with the franchise's SalesChannel(s)
 *
 * If any required step fails, previous steps roll back automatically.
 * Partial / "repair later" success is intentionally not supported.
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
  MedusaError,
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

/** Fulfillment providers every new stock location must expose. */
const REQUIRED_FULFILLMENT_PROVIDERS = ["manual_manual", "cake_cake"] as const

/**
 * True only for known "link already present" failures.
 * Never match bare "exist" / "unique" / "already" — those hit phrases like
 * "does not exist" or "unique to this provider" and would falsely mark a
 * failed fulfillment-provider link as success (half-wired store).
 */
function isBenignLinkError(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    /already\s+(exists?|linked|associated|created)/.test(message) ||
    message.includes("duplicate key") ||
    message.includes("unique constraint") ||
    message.includes("unique_violation") ||
    message.includes("violates unique")
  )
}

async function resolveFranchiseSalesChannelIds(
  container: { resolve: (key: string) => any },
  franchiseId: string
): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: scLinks } = await query.graph({
    entity: FranchiseSalesChannelLink.entryPoint,
    fields: ["sales_channel_id"],
    filters: { franchise_id: franchiseId },
  })

  return Array.from(
    new Set(
      (scLinks as Array<{ sales_channel_id?: string }>)
        .map((l) => l.sales_channel_id)
        .filter((id): id is string => Boolean(id))
    )
  )
}

// ─── Step 0: Preconditions (fail before any writes) ─────────────────────────

const assertFranchiseReadyStep = createStep(
  "assert-franchise-ready-for-store-step",
  async (input: { franchise_id: string }, { container }) => {
    const logger = container.resolve("logger")
    const salesChannelIds = await resolveFranchiseSalesChannelIds(
      container,
      input.franchise_id
    )

    if (!salesChannelIds.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cannot create store location: franchise "${input.franchise_id}" has no ` +
          `sales channel linked via franchise-sales-channel. Link a sales channel ` +
          `to the franchise first, then retry. Partial stores are not allowed.`
      )
    }

    logger.info(
      `[create-store-location] ✓ Step 0: Franchise ${input.franchise_id} has ` +
        `${salesChannelIds.length} sales channel(s)`
    )

    return new StepResponse({ sales_channel_ids: salesChannelIds })
  }
)

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

    // Medusa stock locations expect an Address DTO (or omit address entirely).
    // Our StoreLocation stores free-text `address`; map that to address_1 so
    // createStockLocationsWorkflow does not treat the string as an address_id.
    const addressText =
      typeof input.address === "string" ? input.address.trim() : ""
    const stockAddress = addressText
      ? {
          address_1: addressText,
          // UK-focused deployment; required by some address validators.
          country_code: "gb",
        }
      : undefined

    const { result: stockLocations } = await createStockLocationsWorkflow(
      container
    ).run({
      input: {
        locations: [
          {
            name: input.name,
            ...(stockAddress ? { address: stockAddress } : {}),
            metadata: { auto_provisioned: true },
          },
        ],
      },
    })

    const stockLocation = stockLocations[0]

    // Enable fulfillment providers on the new stock location so shipping
    // options (manual flat pickup + cake calculated delivery) can serve it.
    // Fail closed on real errors; "already linked" is benign.
    const remoteLink = container.resolve(ContainerRegistrationKeys.REMOTE_LINK)
    const linkedProviders: string[] = []

    for (const providerId of REQUIRED_FULFILLMENT_PROVIDERS) {
      try {
        await remoteLink.create({
          [Modules.STOCK_LOCATION]: {
            stock_location_id: stockLocation.id,
          },
          [Modules.FULFILLMENT]: {
            fulfillment_provider_id: providerId,
          },
        })
        linkedProviders.push(providerId)
      } catch (err) {
        if (isBenignLinkError(err)) {
          logger.info(
            `[create-store-location] Provider ${providerId} already linked to ` +
              `StockLocation ${stockLocation.id}`
          )
          linkedProviders.push(providerId)
          continue
        }

        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Cannot create store location: failed to link fulfillment provider ` +
            `"${providerId}" to stock location ${stockLocation.id}. ` +
            `Ensure providers are registered, then retry. ` +
            `(${err instanceof Error ? err.message : String(err)})`
        )
      }
    }

    if (linkedProviders.length !== REQUIRED_FULFILLMENT_PROVIDERS.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cannot create store location: expected fulfillment providers ` +
          `[${REQUIRED_FULFILLMENT_PROVIDERS.join(", ")}] on stock location ` +
          `${stockLocation.id}; only linked [${linkedProviders.join(", ")}].`
      )
    }

    logger.info(
      `[create-store-location] ✓ Step 2: Created StockLocation ${stockLocation.id} ` +
        `("${stockLocation.name}") with providers [${linkedProviders.join(", ")}]`
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
    const logger = container.resolve("logger")

    // Re-resolve (do not trust stale IDs from step 0 alone — links may have changed).
    const salesChannelIds = await resolveFranchiseSalesChannelIds(
      container,
      input.franchise_id
    )

    if (!salesChannelIds.length) {
      // Fail closed — never return a half-provisioned store that needs link-stores.
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cannot create store location: franchise "${input.franchise_id}" has no ` +
          `sales channel linked via franchise-sales-channel. The stock location ` +
          `will not be associated; create is aborted and prior steps will roll back.`
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
      {
        stock_location_id: input.stock_location_id,
        sales_channel_ids: salesChannelIds,
      }
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
    // Step 0: Fail before any writes if franchise cannot fully provision a store
    assertFranchiseReadyStep({
      franchise_id: input.franchise_id,
    })

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
