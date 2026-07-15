import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"

/**
 * GET /store/active-cart
 *
 * Returns the authenticated customer's most recently updated *incomplete*
 * cart, or `{ cart: null }` when they have none.
 *
 * Medusa's store API has no "list my carts" endpoint, so without this route a
 * customer who signs out (which drops the cart id from the browser) could
 * never get their unfinished cart back on the next sign-in. The storefront
 * calls this from `syncCartWithSession` / cart hydration to restore it.
 *
 * Auth: requires a customer session (see middlewares.ts registration). The
 * lookup is scoped to `auth_context.actor_id`, so a customer can only ever
 * see their own cart.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customerId = req.auth_context?.actor_id

  if (!customerId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "A customer session is required."
    )
  }

  const cartService = req.scope.resolve(Modules.CART) as {
    listCarts: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        id: string
        updated_at?: string | Date
        metadata?: Record<string, unknown> | null
        sales_channel_id?: string | null
      }>
    >
  }

  const [cart] = await cartService.listCarts(
    { customer_id: customerId, completed_at: null },
    {
      select: ["id", "updated_at", "metadata", "sales_channel_id"],
      order: { updated_at: "DESC" },
      take: 1,
    }
  )

  res.json({ cart: cart ?? null })
}
