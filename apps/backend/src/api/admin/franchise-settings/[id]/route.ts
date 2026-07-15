/**
 * /admin/franchise-settings/:id  —  GET & PATCH
 *
 * Manages operational settings for a single franchise branch.
 *
 * Settings are persisted in the `franchise` record's `metadata` JSON column
 * (available on every Medusa model).  We use a dedicated `settings` key
 * inside metadata so it never collides with other metadata consumers.
 *
 * Why metadata instead of a separate table?
 * ------------------------------------------
 * - Zero migrations required for a fast-moving feature.
 * - Settings are branch-level, rarely updated, and small (<< 1 KB).
 * - We can graduate to a dedicated table via a migration later with no
 *   breaking API changes — the shape of the response stays identical.
 *
 * Security
 * ---------
 * The existing middleware in middlewares.ts already enforces:
 *   - Authentication (requireAuth).
 *   - Franchise ownership via `resolveAdminFranchiseContext` — callers can
 *     only act on a franchise they are assigned to.
 * We re-validate this here by cross-referencing the :id param against the
 * caller's allowed list.
 */

import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  type AuthenticatedTenantRequest,
} from "../../../../utils/tenant-context"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FranchiseSettings {
  accepting_immediate_orders: boolean
  custom_lead_time_hours: number
  updated_at: string
}

// The subset of the franchise record we need from the query.
type FranchiseRecord = {
  id: string
  metadata?: Record<string, unknown> | null
}

const SETTINGS_METADATA_KEY = "franchise_ops_settings"

/** Returns well-typed settings, filling in defaults for any missing fields. */
function hydrateSettings(metadata: Record<string, unknown> | null | undefined): FranchiseSettings {
  const raw = (metadata?.[SETTINGS_METADATA_KEY] as Partial<FranchiseSettings>) ?? {}
  return {
    accepting_immediate_orders: raw.accepting_immediate_orders ?? true,
    custom_lead_time_hours: raw.custom_lead_time_hours ?? 0,
    updated_at: raw.updated_at ?? new Date(0).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// GET /admin/franchise-settings/:id
// ---------------------------------------------------------------------------

export const GET = async (
  req: AuthenticatedMedusaRequest<undefined>,
  res: MedusaResponse<FranchiseSettings>
) => {
  const tenantReq = req as AuthenticatedTenantRequest
  const allowedIds = await resolveAdminFranchiseIds(tenantReq)
  const { id } = req.params as { id: string }

  // Guard: callers may only read settings for their own franchise(es).
  if (!allowedIds.includes(id)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `You are not authorized to access settings for franchise "${id}".`
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id", "metadata"],
    filters: { id },
  })

  const franchise = (franchises?.[0] as FranchiseRecord | undefined) ?? null

  if (!franchise) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Franchise "${id}" not found.`
    )
  }

  res.json(hydrateSettings(franchise.metadata))
}

// ---------------------------------------------------------------------------
// PATCH /admin/franchise-settings/:id
// ---------------------------------------------------------------------------

type PatchBody = Partial<Pick<FranchiseSettings, "accepting_immediate_orders" | "custom_lead_time_hours">>

export const PATCH = async (
  req: AuthenticatedMedusaRequest<PatchBody>,
  res: MedusaResponse<FranchiseSettings>
) => {
  const tenantReq = req as AuthenticatedTenantRequest
  const allowedIds = await resolveAdminFranchiseIds(tenantReq)
  const { id } = req.params as { id: string }

  // Guard: callers may only modify settings for their own franchise(es).
  if (!allowedIds.includes(id)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `You are not authorized to modify settings for franchise "${id}".`
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // 1. Fetch the current record so we can merge — never blind-overwrite.
  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id", "metadata"],
    filters: { id },
  })

  const franchise = (franchises?.[0] as FranchiseRecord | undefined) ?? null

  if (!franchise) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Franchise "${id}" not found.`
    )
  }

  // 2. Validate inbound payload.
  const body = req.body as PatchBody
  const { accepting_immediate_orders, custom_lead_time_hours } = body

  if (
    accepting_immediate_orders !== undefined &&
    typeof accepting_immediate_orders !== "boolean"
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "`accepting_immediate_orders` must be a boolean."
    )
  }

  if (
    custom_lead_time_hours !== undefined &&
    (!Number.isFinite(custom_lead_time_hours) || custom_lead_time_hours < 0)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "`custom_lead_time_hours` must be a non-negative finite number."
    )
  }

  // 3. Build the merged settings object.
  const existing = hydrateSettings(franchise.metadata)
  const updatedSettings: FranchiseSettings = {
    accepting_immediate_orders:
      accepting_immediate_orders ?? existing.accepting_immediate_orders,
    custom_lead_time_hours:
      custom_lead_time_hours ?? existing.custom_lead_time_hours,
    updated_at: new Date().toISOString(),
  }

  // 4. Persist via the franchise module service.
  //    MedusaService's generated `updateFranchises` method handles the patch.
  const franchiseModuleService = req.scope.resolve<{
    updateFranchises: (
      data: Array<{ id: string; metadata: Record<string, unknown> }>
    ) => Promise<FranchiseRecord[]>
    listStoreLocations: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ id: string }>>
    updateStoreLocations: (
      data: Array<{ id: string; is_accepting_orders?: boolean; custom_lead_time_hours?: number }>
    ) => Promise<any>
  }>("franchise")

  await franchiseModuleService.updateFranchises([
    {
      id,
      metadata: {
        ...(franchise.metadata ?? {}),
        [SETTINGS_METADATA_KEY]: updatedSettings,
      },
    },
  ])

  // Sync to all store locations of this franchise
  const storeLocations = await franchiseModuleService.listStoreLocations({
    franchise_id: id,
  })

  if (storeLocations.length) {
    await franchiseModuleService.updateStoreLocations(
      storeLocations.map((loc) => ({
        id: loc.id,
        is_accepting_orders: updatedSettings.accepting_immediate_orders,
        custom_lead_time_hours: updatedSettings.custom_lead_time_hours,
      }))
    )
  }

  res.json(updatedSettings)
}
