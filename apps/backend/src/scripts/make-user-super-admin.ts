/**
 * make-user-super-admin.ts
 *
 * Sets `metadata.is_super_admin = true` on an admin user so that the
 * `assertSuperAdmin` guard grants them global access to the Super Admin Portal.
 *
 * This is the ONLY authoritative way to grant or revoke super-admin status.
 * Super-admin identity is persisted on the user record itself, not inferred
 * from the absence of franchise links.
 *
 * Usage:
 *   # Grant super-admin
 *   npx medusa exec ./src/scripts/make-user-super-admin.ts -- admin@cakery.com
 *
 *   # Revoke super-admin
 *   npx medusa exec ./src/scripts/make-user-super-admin.ts -- admin@cakery.com revoke
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function makeUserSuperAdmin({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const userService = container.resolve(Modules.USER)

  // Prefer env (reliable in Docker entrypoint) over CLI args, which medusa exec
  // does not always forward the same way in production images.
  const email =
    process.env.MAKE_SUPER_ADMIN_EMAIL?.trim() ||
    args[0] ||
    "admin@cakery.com"
  const isRevoke =
    process.env.MAKE_SUPER_ADMIN_REVOKE === "true" || args[1] === "revoke"

  const action = isRevoke ? "REVOKE" : "GRANT"
  const flag = !isRevoke

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  Super Admin Script — ${action}`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // ── 1. Resolve user by email ──────────────────────────────────────────────
  logger.info(`\n🔍 Looking up user: ${email}`)

  const users = await userService.listUsers({ email })
  if (!users.length) {
    logger.error(`❌ No user found with email "${email}".`)
    logger.error(`   Verify the email exists: SELECT id, email FROM public."user";`)
    throw new Error(`User "${email}" not found.`)
  }

  const user = users[0]
  logger.info(`   ✓ Found: ${user.email} (${user.id})`)

  const currentFlag = (user.metadata as Record<string, unknown> | null)?.is_super_admin

  if (currentFlag === flag) {
    const stateLabel = flag ? "already a Super Admin" : "already NOT a Super Admin"
    logger.info(`   ✅ User is ${stateLabel}. No changes needed.`)
    return
  }

  // ── 2. Write the metadata flag ────────────────────────────────────────────
  logger.info(`\n⚡ Setting metadata.is_super_admin = ${flag}...`)

  await userService.updateUsers([
    {
      id: user.id,
      metadata: {
        ...(user.metadata as Record<string, unknown> | null ?? {}),
        is_super_admin: flag,
      },
    },
  ])

  // ── 3. Read-back verification ─────────────────────────────────────────────
  logger.info(`\n🔍 Verifying...`)
  const [verified] = await userService.listUsers({ email })
  const verifiedFlag = (verified.metadata as Record<string, unknown> | null)?.is_super_admin

  if (verifiedFlag !== flag) {
    logger.error(`❌ Verification failed — flag reads back as: ${verifiedFlag}`)
    throw new Error("Metadata write did not persist correctly.")
  }

  logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  if (flag) {
    logger.info(`  ✅ SUCCESS — "${email}" is now a Global Super Admin`)
    logger.info(`     They can now access /admin/super-admin/* routes.`)
  } else {
    logger.info(`  ✅ SUCCESS — Super Admin access REVOKED for "${email}"`)
    logger.info(`     They will no longer pass the assertSuperAdmin guard.`)
  }
  logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
}
