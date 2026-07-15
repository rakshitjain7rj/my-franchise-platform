/**
 * enable-paypal-on-region.ts
 *
 * Attaches the PayPal payment provider (pp_paypal_paypal, registered by
 * @alphabite/medusa-paypal in medusa-config.ts) to every region so it becomes
 * selectable at checkout. Today that is the single United Kingdom / GBP region.
 *
 * Prerequisites:
 *   - PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET set in the backend env — without
 *     them medusa-config.ts skips the provider and this script aborts cleanly.
 *   - Backend booted at least once with those vars so the provider row exists.
 *
 * Idempotent: regions that already list the provider are left untouched, and
 * existing providers (pp_system_default) are preserved.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/enable-paypal-on-region.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

const PAYPAL_PROVIDER_ID = "pp_paypal_paypal"

export default async function enablePaypalOnRegion({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // ── 1. Ensure the provider is registered and enabled ───────────────────────
  const { data: providers } = await query.graph({
    entity: "payment_provider",
    fields: ["id", "is_enabled"],
    filters: { id: PAYPAL_PROVIDER_ID },
  })

  const provider = providers[0] as { id: string; is_enabled: boolean } | undefined
  if (!provider) {
    throw new Error(
      `Payment provider "${PAYPAL_PROVIDER_ID}" is not registered. ` +
        `Set PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in apps/backend/.env ` +
        `and boot the backend once before running this script.`
    )
  }
  if (!provider.is_enabled) {
    logger.warn(
      `Provider ${PAYPAL_PROVIDER_ID} exists but is disabled — it was likely ` +
        `registered previously and then removed from medusa-config.ts. ` +
        `Re-add it to the config and reboot, then rerun this script.`
    )
    return
  }

  // ── 2. Attach it to every region that doesn't have it yet ──────────────────
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "payment_providers.id"],
    filters: {},
  })
  if (!regions.length) throw new Error("No region found — seed the database first.")

  for (const region of regions as Array<{
    id: string
    name: string
    currency_code: string
    payment_providers?: Array<{ id: string } | null> | null
  }>) {
    const currentIds = (region.payment_providers ?? [])
      .filter((p): p is { id: string } => Boolean(p))
      .map((p) => p.id)

    if (currentIds.includes(PAYPAL_PROVIDER_ID)) {
      logger.info(
        `✓ Region "${region.name}" (${region.currency_code}) already has PayPal.`
      )
      continue
    }

    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: {
          // payment_providers is a full replacement list — keep existing ones.
          payment_providers: [...currentIds, PAYPAL_PROVIDER_ID],
        },
      },
    })
    logger.info(
      `✅ Region "${region.name}" (${region.currency_code}): enabled ` +
        `${PAYPAL_PROVIDER_ID} alongside [${currentIds.join(", ") || "none"}].`
    )
  }
}
