import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { assertSuperAdmin } from "../../helper"

interface CreateUserBody {
  email?: string
  password?: string
  first_name?: string
  last_name?: string
  is_super_admin?: boolean
}

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateUserBody>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const { email, password, first_name, last_name, is_super_admin } = req.body

  if (!email || typeof email !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "email is required."
    )
  }

  if (!password || typeof password !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "password is required."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const userService = req.scope.resolve(Modules.USER)
  const authService = req.scope.resolve(Modules.AUTH)

  // Validate that user with email does not exist
  const { data: existingUsers } = await query.graph({
    entity: "user",
    fields: ["id"],
    filters: { email },
  })

  if (existingUsers.length > 0) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      `User with email "${email}" already exists.`
    )
  }

  // Create the user in the User module
  const createdUsers = await userService.createUsers({
    email,
    first_name: first_name || "",
    last_name: last_name || "",
    metadata: {
      is_super_admin: is_super_admin === true,
    },
  })

  const user = Array.isArray(createdUsers) ? createdUsers[0] : createdUsers

  try {
    // Register authentication identity
    const registerResult = await authService.register("emailpass", {
      body: {
        email,
        password,
      },
    })

    if (!registerResult.success || !registerResult.authIdentity) {
      throw new Error(registerResult.error || "Failed to register auth identity.")
    }

    // Link authentication identity to user record
    await authService.updateAuthIdentities({
      id: registerResult.authIdentity.id,
      app_metadata: {
        user_id: user.id,
      },
    })

    res.json({ user })
  } catch (error: any) {
    // Attempt cleanup of the created user if auth linkage failed
    try {
      await userService.deleteUsers([user.id])
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Failed to create user credentials: ${error.message}`
    )
  }
}
