/**
 * Shared store-location provisioning for admin APIs.
 *
 * Owns:
 *   - franchise existence check
 *   - store code uniqueness
 *   - optional auto-generated codes (`FRANCHISE_CODE-SLUG`)
 *   - createStoreLocationWorkflow invocation (fail-closed full wire-up)
 *
 * Auth stays in the route (franchise context vs super-admin).
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  createStoreLocationWorkflow,
  type CreateStoreLocationWorkflowInput,
} from "../workflows/create-store-location"

export type ProvisionStoreLocationFields = {
  name: string
  franchise_id: string
  /** When omitted, a unique `<FRANCHISE_CODE>-<SLUG>` code is generated. */
  code?: string
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  is_active?: boolean
  is_accepting_orders?: boolean
  custom_lead_time_hours?: number
  daily_order_capacity?: number
  opening_hours?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export type ProvisionStoreLocationResult = {
  store_location: unknown
  stock_location: unknown
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

/**
 * Generate a network-unique store code: `<FRANCHISE_CODE>-<NAME-SLUG>` (+ counter).
 */
export async function generateUniqueStoreCode(
  scope: MedusaContainer,
  franchiseId: string,
  name: string
): Promise<string> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const franchiseModuleService = scope.resolve<any>("franchise")

  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id", "code"],
    filters: { id: franchiseId },
  })

  if (!franchises.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Franchise with ID "${franchiseId}" not found.`
    )
  }

  const franchiseCode = String(
    (franchises[0] as { code?: string }).code ?? ""
  ).trim()
  if (!franchiseCode) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Franchise "${franchiseId}" has no code; cannot auto-generate a store code.`
    )
  }

  const baseCode = `${franchiseCode}-${slugify(name)}`.toUpperCase()
  let generatedCode = baseCode
  let counter = 1

  while (true) {
    const existing = await franchiseModuleService.listStoreLocations({
      code: generatedCode,
    })
    if (!existing.length) {
      return generatedCode
    }
    generatedCode = `${baseCode}-${counter}`
    counter++
  }
}

async function assertFranchiseExists(
  scope: MedusaContainer,
  franchiseId: string
): Promise<void> {
  const franchiseModuleService = scope.resolve<any>("franchise")
  const list = await franchiseModuleService.listFranchises({ id: franchiseId })
  if (!list.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Franchise with ID "${franchiseId}" not found.`
    )
  }
}

async function assertCodeAvailable(
  scope: MedusaContainer,
  code: string
): Promise<void> {
  const franchiseModuleService = scope.resolve<any>("franchise")
  const existing = await franchiseModuleService.listStoreLocations({ code })
  if (existing.length > 0) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      `Location code "${code}" already exists.`
    )
  }
}

/**
 * Provision a fully-wired store location via createStoreLocationWorkflow.
 *
 * Fail-closed: the workflow rolls back if stock, store↔stock link, sales-channel
 * association, or required fulfillment-provider links cannot be completed.
 */
export async function provisionStoreLocation(
  scope: MedusaContainer,
  fields: ProvisionStoreLocationFields
): Promise<ProvisionStoreLocationResult> {
  const name = typeof fields.name === "string" ? fields.name.trim() : ""
  if (!name) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Name must be a non-empty string."
    )
  }

  const franchiseId =
    typeof fields.franchise_id === "string" ? fields.franchise_id.trim() : ""
  if (!franchiseId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "franchise_id is required."
    )
  }

  await assertFranchiseExists(scope, franchiseId)

  let code =
    typeof fields.code === "string" ? fields.code.trim() : ""
  if (!code) {
    code = await generateUniqueStoreCode(scope, franchiseId, name)
  } else {
    await assertCodeAvailable(scope, code)
  }

  const input: CreateStoreLocationWorkflowInput = {
    name,
    code,
    franchise_id: franchiseId,
    address: fields.address ?? null,
    latitude: fields.latitude ?? null,
    longitude: fields.longitude ?? null,
    is_active: fields.is_active ?? true,
    is_accepting_orders: fields.is_accepting_orders ?? true,
    custom_lead_time_hours: fields.custom_lead_time_hours ?? 24,
    daily_order_capacity: fields.daily_order_capacity ?? 10,
    // undefined → workflow applies DEFAULT_OPENING_HOURS (never leave null)
    opening_hours: fields.opening_hours ?? undefined,
    metadata: fields.metadata ?? null,
  }

  const { result } = await createStoreLocationWorkflow(scope).run({ input })

  return {
    store_location: result.store_location,
    stock_location: result.stock_location,
  }
}
