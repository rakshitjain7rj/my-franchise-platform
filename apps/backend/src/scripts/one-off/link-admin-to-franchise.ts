/**
 * link-admin-to-franchise.ts
 *
 * One-time administrative script that creates the architectural link between
 * an admin User and a Franchise using Medusa v2's Link Engine (`remoteLink`).
 *
 * WHY THIS IS NEEDED:
 *   Our tenant middleware (src/utils/tenant-context.ts) resolves the logged-in
 *   admin's franchise scope by querying the `user↔franchise` link table via
 *   `FranchiseUserLink.entryPoint`. If the admin user ("admin@cakery.com") has
 *   no row in this join table, the middleware resolves `franchise_id` to null,
 *   and all scoped endpoints (/admin/products, /admin/orders, etc.) return
 *   empty arrays — which is the exact symptom we're seeing.
 *
 * WHAT IT DOES:
 *   1. Queries the core User module to find "admin@cakery.com".
 *   2. Queries the custom Franchise module to find "Flagship Cakery"
 *      (falls back to the first available franchise if not found by name).
 *   3. Checks for an existing link to avoid duplicate rows.
 *   4. Calls `remoteLink.create()` with the correct link shape.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/link-admin-to-franchise.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import FranchiseUserLink from "../../links/franchise-user"

const TARGET_EMAIL = process.env.TARGET_EMAIL || "admin@cakery.com"
const TARGET_FRANCHISE_NAME = process.env.TARGET_FRANCHISE_NAME || "Flagship Cakery"

export default async function linkAdminToFranchise({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve("remoteLink")
  const franchiseService = container.resolve("franchise")
  const userService = container.resolve(Modules.USER)

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Link Admin User → Franchise (One-Time Script)")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // ── 1. Resolve the admin User ─────────────────────────────────────────────
  logger.info(`\n🔍 Looking up user with email: ${TARGET_EMAIL}`)

  const users = await userService.listUsers({ email: TARGET_EMAIL })

  if (!users.length) {
    logger.error(
      `❌ FATAL: No user found with email "${TARGET_EMAIL}".\n` +
        `   Please verify the email exists in your database.\n` +
        `   You can check with: SELECT id, email FROM public."user";`
    )
    throw new Error(`User "${TARGET_EMAIL}" not found in the database.`)
  }

  const adminUser = users[0]
  logger.info(`   ✓ Found user: ${adminUser.email}`)
  logger.info(`   ✓ User ID:    ${adminUser.id}`)

  // ── 2. Resolve the target Franchise ───────────────────────────────────────
  logger.info(`\n🔍 Looking up franchise: "${TARGET_FRANCHISE_NAME}"`)

  const allFranchises = await franchiseService.listFranchises()

  if (!allFranchises.length) {
    logger.error(
      `❌ FATAL: No franchises found in the database.\n` +
        `   Run the franchise seed script first:\n` +
        `   npx medusa exec ./src/scripts/seed-franchise-data.ts`
    )
    throw new Error("No franchises exist in the database.")
  }

  // Try exact name match first, fall back to first franchise
  let targetFranchise = allFranchises.find(
    (f: { name: string }) =>
      f.name.toLowerCase() === TARGET_FRANCHISE_NAME.toLowerCase()
  )

  if (targetFranchise) {
    logger.info(`   ✓ Found franchise by name: "${targetFranchise.name}"`)
  } else {
    targetFranchise = allFranchises[0]
    logger.warn(
      `   ⚠ No franchise named "${TARGET_FRANCHISE_NAME}" found.\n` +
        `     Falling back to first available franchise: "${targetFranchise.name}"`
    )
  }

  logger.info(`   ✓ Franchise ID: ${targetFranchise.id}`)

  if (allFranchises.length > 1) {
    logger.info(
      `   ℹ All available franchises: ${allFranchises
        .map((f: { id: string; name: string }) => `${f.name} (${f.id})`)
        .join(", ")}`
    )
  }

  // ── 3. Check for an existing link ─────────────────────────────────────────
  logger.info(`\n🔗 Checking for existing user↔franchise link...`)

  const { data: existingLinks } = await query.graph({
    entity: FranchiseUserLink.entryPoint,
    fields: ["user_id", "franchise_id"],
    filters: {
      user_id: adminUser.id,
      franchise_id: targetFranchise.id,
    },
  })

  if (existingLinks.length > 0) {
    logger.info(
      `   ✅ Link already exists! User "${adminUser.email}" is already linked ` +
        `to franchise "${targetFranchise.name}".\n` +
        `   No action needed. Your dashboard should be working.\n` +
        `   If it's still showing 0 metrics, the issue may be elsewhere ` +
        `(check x-franchise-id header injection).`
    )
    return
  }

  logger.info(`   ✓ No existing link found — proceeding to create one.`)

  // ── 4. Create the link via Medusa's Link Engine ───────────────────────────
  logger.info(`\n⚡ Creating link...`)
  logger.info(`   User:      ${adminUser.email} (${adminUser.id})`)
  logger.info(`   Franchise: ${targetFranchise.name} (${targetFranchise.id})`)

  try {
    await remoteLink.create({
      [Modules.USER]: { user_id: adminUser.id },
      franchise: { franchise_id: targetFranchise.id },
    })

    logger.info(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    logger.info(`  ✅ SUCCESS — Link created!`)
    logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    logger.info(``)
    logger.info(`  User:      ${adminUser.email}`)
    logger.info(`  User ID:   ${adminUser.id}`)
    logger.info(`  Franchise: ${targetFranchise.name}`)
    logger.info(`  Fran. ID:  ${targetFranchise.id}`)
    logger.info(``)
    logger.info(`  The tenant middleware will now resolve this user's`)
    logger.info(`  franchise context correctly. Refresh your dashboard.`)
    logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`\n❌ Failed to create link: ${message}`)
    logger.error(`   This may indicate a schema mismatch or migration issue.`)
    logger.error(`   Verify the link table exists by running:`)
    logger.error(
      `   SELECT * FROM information_schema.tables WHERE table_name LIKE '%user%franchise%';`
    )
    throw error
  }

  // ── 5. Verify the link was created ────────────────────────────────────────
  logger.info(`\n🔍 Verifying link...`)

  const { data: verifyLinks } = await query.graph({
    entity: FranchiseUserLink.entryPoint,
    fields: ["user_id", "franchise_id"],
    filters: {
      user_id: adminUser.id,
    },
  })

  if (verifyLinks.length > 0) {
    logger.info(
      `   ✓ Verified: User is now linked to ${verifyLinks.length} franchise(s):`
    )
    for (const link of verifyLinks) {
      const linkRecord = link as { user_id?: string; franchise_id?: string }
      logger.info(
        `     • user_id=${linkRecord.user_id} → franchise_id=${linkRecord.franchise_id}`
      )
    }
  } else {
    logger.warn(`   ⚠ Verification query returned 0 links — investigate manually.`)
  }
}
