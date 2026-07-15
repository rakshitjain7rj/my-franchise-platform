/**
 * @file /admin/super-admin/store-user-links
 * @description Manage user ↔ store location links (branch manager assignments).
 *
 * Security: All endpoints require super-admin authentication.
 *
 * The store_location_user link table (see src/links/store-location-user.ts)
 * controls Tier-2 (store-level) scoping: a user WITH store links only sees
 * their branch's orders; a user WITHOUT links sees the full franchise.
 *
 * GET    → List all user↔store links (with user email, store name, franchise name)
 * POST   → Create a new user↔store link (validates user is in the store's franchise)
 * DELETE → Remove a user↔store link
 */

import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { assertSuperAdmin } from "../helper"
import StoreLocationUserLink from "../../../../links/store-location-user"
import FranchiseUserLink from "../../../../links/franchise-user"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StoreUserLinkRecord = {
  user_id: string
  store_location_id: string
  user?: { id: string; email: string; first_name?: string; last_name?: string }
  store_location?: { id: string; name: string; code: string; franchise_id?: string }
}

// ---------------------------------------------------------------------------
// GET /admin/super-admin/store-user-links
// ---------------------------------------------------------------------------

export const GET = async (
  req: AuthenticatedMedusaRequest<undefined>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: links } = await query.graph({
    entity: StoreLocationUserLink.entryPoint,
    fields: [
      "user_id",
      "store_location_id",
      "user.id",
      "user.email",
      "user.first_name",
      "user.last_name",
      "store_location.id",
      "store_location.name",
      "store_location.code",
      "store_location.franchise_id",
    ],
  })

  res.json({ links })
}

// ---------------------------------------------------------------------------
// POST /admin/super-admin/store-user-links
// ---------------------------------------------------------------------------

interface CreateStoreUserLinkBody {
  user_id: string
  store_location_id: string
}

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateStoreUserLinkBody>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const { user_id, store_location_id } = req.body

  if (!user_id || typeof user_id !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "user_id is required."
    )
  }
  if (!store_location_id || typeof store_location_id !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "store_location_id is required."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = req.scope.resolve("remoteLink")

  // ── Validate user exists ─────────────────────────────────────────────────
  const { data: users } = await query.graph({
    entity: "user",
    fields: ["id", "email"],
    filters: { id: user_id },
  })
  if (!users.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `User "${user_id}" not found.`
    )
  }

  // ── Validate store location exists and get its franchise ─────────────────
  const { data: storeLocations } = await query.graph({
    entity: "store_location",
    fields: ["id", "name", "franchise_id"],
    filters: { id: store_location_id },
  })
  if (!storeLocations.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Store location "${store_location_id}" not found.`
    )
  }

  const storeLocation = storeLocations[0] as {
    id: string
    name: string
    franchise_id?: string
  }

  // ── Validate user belongs to the store's franchise ───────────────────────
  if (storeLocation.franchise_id) {
    const { data: franchiseLinks } = await query.graph({
      entity: FranchiseUserLink.entryPoint,
      fields: ["user_id", "franchise_id"],
      filters: {
        user_id,
        franchise_id: storeLocation.franchise_id,
      },
    })

    if (!franchiseLinks.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `User "${users[0].email}" is not a member of the franchise that owns ` +
          `store "${storeLocation.name}". Link the user to the franchise first.`
      )
    }
  }

  // ── Check for duplicate link ─────────────────────────────────────────────
  const { data: existingLinks } = await query.graph({
    entity: StoreLocationUserLink.entryPoint,
    fields: ["user_id", "store_location_id"],
    filters: { user_id, store_location_id },
  })

  if (existingLinks.length > 0) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      `User "${users[0].email}" is already assigned to store "${storeLocation.name}".`
    )
  }

  // ── Create the link ──────────────────────────────────────────────────────
  await remoteLink.create({
    [Modules.USER]: { user_id },
    franchise: { store_location_id },
  })

  res.json({
    success: true,
    message: `Assigned ${users[0].email} to store ${storeLocation.name}`,
  })
}

// ---------------------------------------------------------------------------
// DELETE /admin/super-admin/store-user-links
// ---------------------------------------------------------------------------

export const DELETE = async (
  req: AuthenticatedMedusaRequest<undefined>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const { user_id, store_location_id } = req.query as {
    user_id?: string
    store_location_id?: string
  }

  if (!user_id || typeof user_id !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "user_id query parameter is required."
    )
  }
  if (!store_location_id || typeof store_location_id !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "store_location_id query parameter is required."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = req.scope.resolve("remoteLink")

  // ── Verify link exists ───────────────────────────────────────────────────
  const { data: existingLinks } = await query.graph({
    entity: StoreLocationUserLink.entryPoint,
    fields: ["user_id", "store_location_id"],
    filters: { user_id, store_location_id },
  })

  if (!existingLinks.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No active link between user "${user_id}" and store "${store_location_id}".`
    )
  }

  await remoteLink.dismiss({
    [Modules.USER]: { user_id },
    franchise: { store_location_id },
  })

  res.json({
    success: true,
    message: "User unlinked from store location successfully.",
  })
}
