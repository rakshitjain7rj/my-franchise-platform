/**
 * auto-link-product-to-franchise.ts
 *
 * ⚠️  DEPRECATED — replaced by a synchronous workflow hook.
 *
 * This subscriber used to listen for the `product.created` event and try to
 * create a franchise-product link asynchronously. This approach suffered from
 * two fatal flaws:
 *
 *   1. **Race condition** — the subscriber ran AFTER the HTTP response was
 *      sent, so the Admin UI's immediate GET /admin/products/:id would hit
 *      the `filterAdminProductsByFranchise` middleware before the link existed,
 *      resulting in "Product not found".
 *
 *   2. **Missing context** — Medusa's `product.created` event does not
 *      reliably carry `actor_id` from the HTTP request context, so the
 *      subscriber often had no way to resolve the creator's franchise.
 *
 * The replacement is:
 *   - `src/workflows/hooks/product-created.ts` — synchronous hook on
 *     `createProductsWorkflow.hooks.productsCreated` that links the product
 *     within the same transaction.
 *   - `src/api/middlewares/inject-franchise-for-product-creation.ts` —
 *     middleware on `POST /admin/products` that injects the admin's
 *     franchise_id into `additional_data` before the workflow runs.
 *
 * This file is kept as a no-op so Medusa doesn't warn about a missing
 * subscriber export.
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function autoLinkProductToFranchise({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  // No-op — replaced by workflow hook.
  // See: src/workflows/hooks/product-created.ts
}

export const config: SubscriberConfig = {
  // Unsubscribe from the event by using an event name that doesn't exist.
  // This effectively disables the subscriber without removing the file.
  event: "__deprecated_product_created_subscriber__" as any,
}
