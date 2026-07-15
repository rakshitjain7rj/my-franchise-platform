import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { assertSuperAdmin } from "../../../helper"

interface ResetPasswordBody {
  password?: string
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<ResetPasswordBody>,
  res: MedusaResponse
) => {
  await assertSuperAdmin(req)

  const { id } = req.params as { id: string }
  const { password } = req.body

  if (!password || typeof password !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "password is required and must be a string."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const authService = req.scope.resolve(Modules.AUTH)

  // Retrieve user email
  const { data: rawUsers } = await query.graph({
    entity: "user",
    fields: ["id", "email"],
    filters: { id },
  })

  if (rawUsers.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `User with ID "${id}" not found.`
    )
  }

  const user = rawUsers[0]

  // Attempt to update existing credentials
  let result = await authService.updateProvider("emailpass", {
    entity_id: user.email,
    password,
  })

  // Fallback: If identity does not exist (e.g. user was seeded or invited without registering), register it
  if (!result.success) {
    try {
      const registerResult = await authService.register("emailpass", {
        body: {
          email: user.email,
          password,
        },
      })
      if (registerResult.success && registerResult.authIdentity) {
        await authService.updateAuthIdentities({
          id: registerResult.authIdentity.id,
          app_metadata: {
            user_id: user.id,
          },
        })
        result = { success: true }
      } else {
        throw new Error(registerResult.error || "Failed to register new auth identity.")
      }
    } catch (err: any) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Failed to reset password: ${result.error || err.message}`
      )
    }
  }

  res.json({ success: true, message: "Password reset successfully." })
}
