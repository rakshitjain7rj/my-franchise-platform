import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { assertSuperAdmin } from "../helper"
import FranchiseUserLink from "../../../../links/franchise-user"
import StoreLocationUserLink from "../../../../links/store-location-user"

// ---------------------------------------------------------------------------
// GET /admin/super-admin/users
// ---------------------------------------------------------------------------
export const GET = async (
  req: AuthenticatedMedusaRequest<undefined>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Step 1: fetch all users (no franchise relation on the User entity itself)
  const { data: rawUsers } = await query.graph({
    entity: "user",
    fields: ["id", "email", "first_name", "last_name", "created_at", "metadata"],
  })

  // Step 2: fetch all franchise<->user links and expand both sides
  const { data: links } = await query.graph({
    entity: FranchiseUserLink.entryPoint,
    fields: ["user_id", "franchise_id", "user.id", "franchise.id", "franchise.name"],
  })

  // Build a lookup map: user_id -> array of franchise data
  const franchiseByUserId: Record<string, Array<{ id: string; name: string }>> = {}
  for (const link of links) {
    const userId = (link as any).user_id
    const franchise = (link as any).franchise
    if (franchise) {
      if (!franchiseByUserId[userId]) {
        franchiseByUserId[userId] = []
      }
      franchiseByUserId[userId].push(franchise)
    }
  }

  // Step 3: fetch all store_location<->user links
  const { data: storeLinks } = await query.graph({
    entity: StoreLocationUserLink.entryPoint,
    fields: [
      "user_id",
      "store_location_id",
      "store_location.id",
      "store_location.name",
      "store_location.code",
    ],
  })

  // Build a lookup map: user_id -> array of store location data
  const storesByUserId: Record<string, Array<{ id: string; name: string; code: string }>> = {}
  for (const link of storeLinks) {
    const userId = (link as any).user_id
    const storeLocation = (link as any).store_location
    if (storeLocation) {
      if (!storesByUserId[userId]) {
        storesByUserId[userId] = []
      }
      storesByUserId[userId].push(storeLocation)
    }
  }

  // Step 4: merge
  const users = rawUsers.map((u: any) => ({
    ...u,
    franchise: franchiseByUserId[u.id] ?? [],
    store_locations: storesByUserId[u.id] ?? [],
  }))

  res.json({ users })
}

// ---------------------------------------------------------------------------
// POST /admin/super-admin/users (Link user to franchise)
// ---------------------------------------------------------------------------
interface LinkUserBody {
  user_id: string
  franchise_id: string
}

export const POST = async (
  req: AuthenticatedMedusaRequest<LinkUserBody>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const { user_id, franchise_id } = req.body

  if (!user_id || typeof user_id !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "user_id is required."
    )
  }

  if (!franchise_id || typeof franchise_id !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "franchise_id is required."
    )
  }

  const remoteLink = req.scope.resolve("remoteLink")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Validate that user exists
  const { data: users } = await query.graph({
    entity: "user",
    fields: ["id", "email"],
    filters: { id: user_id },
  })
  if (users.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `User with ID "${user_id}" not found.`
    )
  }

  // Validate that franchise exists
  const franchiseModuleService = req.scope.resolve<any>("franchise")
  const franchises = await franchiseModuleService.listFranchises({ id: franchise_id })
  if (franchises.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Franchise with ID "${franchise_id}" not found.`
    )
  }

  // Guard: check for an existing link to prevent duplicate rows in the link table
  const { data: existingLinks } = await query.graph({
    entity: FranchiseUserLink.entryPoint,
    fields: ["user_id", "franchise_id"],
    filters: { user_id, franchise_id },
  })

  if (existingLinks.length > 0) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      `User "${users[0].email}" is already linked to franchise "${franchises[0].name}".`
    )
  }

  await remoteLink.create({
    [Modules.USER]: { user_id },
    franchise: { franchise_id },
  })

  res.json({ success: true, message: `Linked user ${users[0].email} to franchise ${franchises[0].name}` })
}

// ---------------------------------------------------------------------------
// DELETE /admin/super-admin/users (Unlink user from franchise)
// ---------------------------------------------------------------------------
export const DELETE = async (
  req: AuthenticatedMedusaRequest<undefined>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const { user_id, franchise_id } = req.query as { user_id?: string; franchise_id?: string }

  if (!user_id || typeof user_id !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "user_id query parameter is required."
    )
  }

  if (!franchise_id || typeof franchise_id !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "franchise_id query parameter is required."
    )
  }

  const remoteLink = req.scope.resolve("remoteLink")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Guard: verify the link actually exists before attempting to dismiss it
  const { data: existingLinks } = await query.graph({
    entity: FranchiseUserLink.entryPoint,
    fields: ["user_id", "franchise_id"],
    filters: { user_id, franchise_id },
  })

  if (existingLinks.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No active link found between user "${user_id}" and franchise "${franchise_id}".`
    )
  }

  await remoteLink.dismiss({
    [Modules.USER]: { user_id },
    franchise: { franchise_id },
  })

  res.json({ success: true, message: "Unlinked user from franchise successfully." })
}
