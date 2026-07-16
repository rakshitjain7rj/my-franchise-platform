/**
 * POST /admin/link-stores
 *
 * ─── PURPOSE ──────────────────────────────────────────────────────────────────
 * Legacy repair endpoint for backfilling the Link Engine table
 * `store_location ↔ stock_location` for stores that were created before
 * the atomic `createStoreLocationWorkflow` was introduced.
 *
 * ─── DEPRECATION NOTICE ─────────────────────────────────────────────────────
 * The auto-match (fuzzy name) mode has been RETIRED. New store locations
 * created via POST /admin/franchise-locations or POST /admin/super-admin/locations
 * are fully provisioned atomically and fail closed (no half-wired stores) —
 * StockLocation, store↔stock link, sales-channel association, and required
 * fulfillment providers are all created in one workflow.
 *
 * This endpoint now ONLY supports explicit manual mappings for repairing
 * legacy stores that were created before the workflow existed.
 *
 * ─── USAGE ──────────────────────────────────────────────────────────────────
 *   POST /admin/link-stores
 *   {
 *     "mappings": [
 *       { "store_location_id": "stloc_01KX...", "stock_location_id": "sloc_01KY..." }
 *     ]
 *   }
 *
 * ─── SECURITY ─────────────────────────────────────────────────────────────────
 * Super-admin only.
 */

import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import StoreLocationStockLocationLink from "../../../links/store-location-stock-location"
import { assertSuperAdmin } from "../super-admin/helper"

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type ManualMapping = {
  store_location_id: string
  stock_location_id: string
}

type RequestBody = {
  /** Explicit store_location_id → stock_location_id mappings. Required. */
  mappings: ManualMapping[]
}

type StoreResult = {
  store_location_id: string
  status: "linked" | "already_linked" | "error"
  stock_location_id?: string
  stock_location_name?: string
  error?: string
}

type LinkStoresResponse = {
  deprecated: true
  deprecation_notice: string
  summary: {
    total_mappings: number
    already_linked: number
    newly_linked: number
    errors: number
  }
  results: StoreResult[]
}

// ──────────────────────────────────────────────────────────────────────────────
// Route Handler
// ──────────────────────────────────────────────────────────────────────────────

export const POST = async (
  req: AuthenticatedMedusaRequest<RequestBody>,
  res: MedusaResponse<LinkStoresResponse>
) => {
  await assertSuperAdmin(req)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = req.scope.resolve<any>(
    ContainerRegistrationKeys.REMOTE_LINK
  )

  const manualMappings: ManualMapping[] = req.body?.mappings ?? []

  if (!manualMappings.length) {
    console.warn(
      `[link-stores] ⚠ DEPRECATED: Auto-match mode has been removed. ` +
        `New stores are now fully provisioned by the createStoreLocationWorkflow. ` +
        `Pass explicit "mappings" to repair legacy stores only.`
    )

    return res.json({
      deprecated: true,
      deprecation_notice:
        "Auto-match mode has been removed. New store locations are atomically " +
        "provisioned with StockLocation + link + sales-channel by the " +
        "createStoreLocationWorkflow. Pass explicit 'mappings' array to " +
        "repair legacy stores that were created before this workflow existed.",
      summary: {
        total_mappings: 0,
        already_linked: 0,
        newly_linked: 0,
        errors: 0,
      },
      results: [],
    })
  }

  console.log(
    `\n[link-stores] ─── Legacy repair started (${new Date().toISOString()}) ───`
  )
  console.log(
    `[link-stores] Processing ${manualMappings.length} explicit mapping(s)`
  )

  // Fetch existing links for idempotency
  const storeLocationIds = manualMappings.map((m) => m.store_location_id)
  const { data: existingLinks } = await query.graph({
    entity: StoreLocationStockLocationLink.entryPoint,
    fields: ["store_location_id", "stock_location_id"],
    filters: { store_location_id: storeLocationIds },
  })

  const alreadyLinkedStoreIds = new Set<string>(
    (existingLinks as Array<{ store_location_id: string }>).map(
      (link) => link.store_location_id
    )
  )

  const results: StoreResult[] = []
  let newlyLinked = 0
  let errors = 0

  for (const mapping of manualMappings) {
    // Skip already-linked stores
    if (alreadyLinkedStoreIds.has(mapping.store_location_id)) {
      console.log(
        `[link-stores]   ↳ SKIP  ${mapping.store_location_id} — already linked`
      )
      results.push({
        store_location_id: mapping.store_location_id,
        status: "already_linked",
      })
      continue
    }

    try {
      await remoteLink.create({
        franchise: {
          store_location_id: mapping.store_location_id,
        },
        [Modules.STOCK_LOCATION]: {
          stock_location_id: mapping.stock_location_id,
        },
      })

      // Resolve name for response (best-effort)
      let stockLocName: string | undefined
      try {
        const { data: stockLocs } = await query.graph({
          entity: "stock_location",
          fields: ["id", "name"],
          filters: { id: mapping.stock_location_id },
        })
        stockLocName = (stockLocs as Array<{ name?: string }>)[0]?.name
      } catch {
        // Non-critical
      }

      console.log(
        `[link-stores]   ↳ LINKED  ${mapping.store_location_id} → ${stockLocName ?? mapping.stock_location_id}`
      )

      results.push({
        store_location_id: mapping.store_location_id,
        status: "linked",
        stock_location_id: mapping.stock_location_id,
        stock_location_name: stockLocName,
      })
      newlyLinked++
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      console.error(
        `[link-stores]   ↳ ERROR  ${mapping.store_location_id} — ${errorMessage}`
      )

      results.push({
        store_location_id: mapping.store_location_id,
        status: "error",
        stock_location_id: mapping.stock_location_id,
        error: errorMessage,
      })
      errors++
    }
  }

  const summary = {
    total_mappings: manualMappings.length,
    already_linked: alreadyLinkedStoreIds.size,
    newly_linked: newlyLinked,
    errors,
  }

  console.log(`\n[link-stores] ─── Legacy repair complete ───`)
  console.log(`[link-stores] Total mappings : ${summary.total_mappings}`)
  console.log(`[link-stores] Already linked : ${summary.already_linked}`)
  console.log(`[link-stores] Newly linked   : ${summary.newly_linked}`)
  console.log(`[link-stores] Errors         : ${summary.errors}`)
  console.log(`[link-stores] ────────────────────────────\n`)

  return res.json({
    deprecated: true,
    deprecation_notice:
      "This endpoint is for legacy backfill only. New store locations are " +
      "atomically provisioned by the createStoreLocationWorkflow.",
    summary,
    results,
  })
}
