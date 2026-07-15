import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

/**
 * Asserts that the authenticated user is a Super Admin.
 *
 * A Super Admin is an admin user whose `metadata.is_super_admin` flag is
 * explicitly set to `true`. This flag is set by running the setup script:
 *
 *   npx medusa exec ./src/scripts/make-user-super-admin.ts -- <email>
 *
 * IMPORTANT: Super Admin status is NOT inferred from the absence of franchise
 * links. Using the "no links = super admin" model is insecure because any
 * newly-created, unassigned admin user would silently inherit global access.
 *
 * @throws MedusaError.Types.NOT_ALLOWED  — if the request is not authenticated.
 * @throws MedusaError.Types.FORBIDDEN   — if the user lacks the super_admin flag.
 */
export const assertSuperAdmin = async (req: any): Promise<void> => {
  const actorId = req.auth_context?.actor_id
  if (!actorId) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Not authenticated as an administrator."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: users } = await query.graph({
    entity: "user",
    fields: ["id", "metadata"],
    filters: { id: actorId },
  })

  if (!users.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Authenticated user record not found."
    )
  }

  const metadata = (users[0].metadata as Record<string, unknown> | null) ?? {}

  if (metadata.is_super_admin !== true) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "Access denied: this area is restricted to global administrators."
    )
  }
}
