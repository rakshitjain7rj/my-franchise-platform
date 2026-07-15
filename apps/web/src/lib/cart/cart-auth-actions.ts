"use server";

/**
 * src/lib/cart/cart-auth-actions.ts
 *
 * Server Actions bridging the cart and the customer session.
 *
 * The customer JWT lives in the httpOnly `medusa_auth_token` cookie, so any
 * cart operation that must run as the logged-in customer (e.g. transferring
 * ownership of a guest cart after login) has to happen server-side — the
 * browser-side cart helpers in `cart-actions.ts` can never see the token.
 */

import { getMedusaHeaders } from "@/lib/medusa/headers";
import type { MedusaCart } from "./cart-actions";

const BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "http://localhost:9000";

/**
 * Transfers ownership of a cart to the currently logged-in customer via
 * Medusa's `POST /store/carts/:id/customer` route.
 *
 * Returns the updated cart on success, or `null` when:
 *  - there is no active customer session (nothing to transfer to), or
 *  - the transfer fails (cart expired, backend unreachable, …).
 *
 * IMPORTANT: Medusa transfers ownership unconditionally, even from another
 * registered customer. Callers must therefore only invoke this for carts
 * whose `customer_id` is empty or already equals the session customer —
 * see `syncCartWithSession()` in cart-context.tsx.
 */
export async function transferCartToCustomer(
  cartId: string
): Promise<MedusaCart | null> {
  try {
    const headers = await getMedusaHeaders();
    if (!headers["Authorization"]) {
      return null;
    }

    const res = await fetch(
      `${BACKEND_URL}/store/carts/${cartId}/customer?fields=${encodeURIComponent("+customer_id")}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(
        "[transferCartToCustomer] Transfer failed:",
        (body as { message?: string }).message ?? res.status
      );
      return null;
    }

    const { cart } = (await res.json()) as { cart: MedusaCart };
    return cart;
  } catch (err) {
    console.error("[transferCartToCustomer] Error transferring cart:", err);
    return null;
  }
}

/**
 * Slim cart reference returned by the custom `GET /store/active-cart` route.
 */
export interface ActiveCartRef {
  id: string;
  metadata?: Record<string, unknown> | null;
  sales_channel_id?: string | null;
}

/**
 * Looks up the logged-in customer's most recently updated *incomplete* cart
 * so it can be restored after sign-in (or on a fresh browser while the
 * session cookie is still valid).
 *
 * Returns `null` when the visitor is anonymous, has no unfinished cart, or
 * the lookup fails.
 */
export async function findActiveCustomerCart(): Promise<ActiveCartRef | null> {
  try {
    const headers = await getMedusaHeaders();
    if (!headers["Authorization"]) {
      return null;
    }

    const res = await fetch(`${BACKEND_URL}/store/active-cart`, {
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const { cart } = (await res.json()) as { cart: ActiveCartRef | null };
    return cart ?? null;
  } catch (err) {
    console.error("[findActiveCustomerCart] Error looking up cart:", err);
    return null;
  }
}
