/**
 * inject-franchise-for-product-creation.ts
 *
 * Middleware for `POST /admin/products` that automatically injects the
 * authenticated admin user's franchise_id(s) into `req.body.additional_data`.
 *
 * Why this is necessary
 * ─────────────────────
 * The Medusa Admin UI knows nothing about our custom `franchise` module. When
 * a franchise admin creates a product, the Admin UI sends a standard product
 * creation payload — it never includes a `franchise_id`.
 *
 * Our `createProductsWorkflow.hooks.productsCreated` hook (see
 * `src/workflows/hooks/product-created.ts`) needs the `franchise_id` in
 * `additional_data` to create the franchise-product link synchronously.
 *
 * This middleware bridges the gap:
 *   1. Reads `req.auth_context.actor_id` (the logged-in admin user).
 *   2. Queries the `franchise-user` link table to find which franchise(s)
 *      the user belongs to.
 *   3. Injects the first franchise_id into `req.body.additional_data`.
 *
 * If the user has no franchise assignment (super-admin), we skip injection
 * silently — the workflow hook will also skip linking.
 */

import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import FranchiseUserLink from "../../links/franchise-user"

export const injectAdminFranchiseForProductCreation = async (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const actorId = (req as any).auth_context?.actor_id

    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger.info(`[inject-franchise] POST /admin/products — actorId=${actorId ?? "MISSING"}`)

    if (!actorId) {
      // No authenticated user — let Medusa's own auth guard handle this.
      logger.warn("[inject-franchise] No actorId found — skipping franchise injection")
      return next()
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    // Look up the admin's franchise membership(s).
    const { data: franchiseUserLinks } = await query.graph({
      entity: FranchiseUserLink.entryPoint,
      fields: ["franchise_id"],
      filters: { user_id: actorId },
    })

    logger.info(`[inject-franchise] franchise-user query returned ${franchiseUserLinks.length} link(s): ${JSON.stringify(franchiseUserLinks)}`)

    const franchiseIds: string[] = Array.from(
      new Set(
        franchiseUserLinks
          .map((link: { franchise_id?: string }) => link.franchise_id)
          .filter((id: string | undefined): id is string => Boolean(id))
      )
    )

    if (!franchiseIds.length) {
      logger.info(
        `[inject-franchise] Admin ${actorId} has no franchise — ` +
          "product will be created without franchise link."
      )
      return next()
    }

    // Inject franchise_id into additional_data so the workflow hook can
    // pick it up synchronously.
    //
    // ⚠️  IMPORTANT: Medusa's POST /admin/products handler reads
    //     `additional_data` from `req.validatedBody` (not `req.body`):
    //
    //       const { additional_data, ...products } = req.validatedBody
    //
    //     `req.validatedBody` is set by Medusa's internal
    //     `validateAndTransformBody` middleware which runs BEFORE custom
    //     middlewares.  Mutating only `req.body` has no effect on the workflow.
    //     We must mutate `req.validatedBody` directly.
    if (!req.body) {
      req.body = {} as any
    }

    const body = req.body as Record<string, unknown>
    const existingAdditionalData =
      (body.additional_data as Record<string, unknown>) ?? {}

    const injectedAdditionalData = {
      ...existingAdditionalData,
      // For multi-franchise admins, send all franchise IDs. The hook will
      // link the product to each one.
      franchise_id:
        franchiseIds.length === 1 ? franchiseIds[0] : franchiseIds,
    }

    // Mutate req.body for any middleware that may read it.
    body.additional_data = injectedAdditionalData

    // Mutate req.validatedBody — this is what Medusa's route handler actually
    // destructures to pass into createProductsWorkflow.
    if (req.validatedBody) {
      const validatedBody = req.validatedBody as Record<string, unknown>
      const existingValidatedAdditionalData =
        (validatedBody.additional_data as Record<string, unknown>) ?? {}
      validatedBody.additional_data = {
        ...existingValidatedAdditionalData,
        franchise_id: injectedAdditionalData.franchise_id,
      }
    }

    logger.info(
      `[inject-franchise] ✓ Injected franchise_id=${franchiseIds.join(",")} ` +
        `for admin ${actorId}. additional_data=${JSON.stringify(body.additional_data)}`
    )

    next()
  } catch (err: unknown) {
    next(err)
  }
}
