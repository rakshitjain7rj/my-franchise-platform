/**
 * src/lib/medusa/sdk.ts
 *
 * Exports a pre-configured Medusa SDK singleton for use in Server Components,
 * Route Handlers, and Server Actions.
 *
 * Usage
 * -----
 *   import { getMedusaSdk }      from "@/lib/medusa/sdk";
 *   import { getMedusaHeaders }  from "@/lib/medusa/headers";
 *
 *   const sdk     = getMedusaSdk();
 *   const headers = await getMedusaHeaders();
 *
 *   const { products } = await sdk.store.product.list({}, headers);
 *
 * Notes
 * -----
 * • `@medusajs/js-sdk` is already in the monorepo node_modules. The SDK's
 *   default export is the `Medusa` class. Named export is `Client`.
 *
 * • Always pass the result of `getMedusaHeaders()` as the second argument to
 *   every SDK call — it carries both the publishable key and `x-franchise-id`.
 *
 * • Do NOT await SDK calls at module level. Keep them inside async Server
 *   Components so Next.js can correctly track the request lifecycle.
 */

import MedusaSDK from "@medusajs/js-sdk";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MEDUSA_BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "http://localhost:9000";

const MEDUSA_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_MEDUSA_API_KEY ??
  "";

// ---------------------------------------------------------------------------
// SDK singleton
// ---------------------------------------------------------------------------

let _sdk: InstanceType<typeof MedusaSDK> | null = null;

/**
 * Returns the shared Medusa SDK instance (lazy-initialised).
 *
 * Prefer calling this inside a component body or function, not at module scope,
 * so that environment variables are fully resolved at call-time.
 */
export function getMedusaSdk(): InstanceType<typeof MedusaSDK> {
  if (_sdk) return _sdk;

  _sdk = new MedusaSDK({
    baseUrl: MEDUSA_BACKEND_URL,
    publishableKey: MEDUSA_PUBLISHABLE_KEY,
    /**
     * We intentionally set auth to "session" so the SDK does NOT auto-inject
     * its own publishable-key header. We manage all headers via
     * `getMedusaHeaders()` to ensure `x-franchise-id` is always included.
     *
     * NOTE: If you need JWT auth, switch to { type: "jwt" } and pass the token
     *       in the extraHeaders argument of getMedusaHeaders().
     */
    auth: { type: "session" },
  });

  return _sdk;
}

/**
 * Convenience proxy so you can write `sdk.store.product.list(...)` directly.
 *
 * @example
 * ```ts
 * import { sdk }               from "@/lib/medusa/sdk";
 * import { getMedusaHeaders }  from "@/lib/medusa/headers";
 *
 * const headers  = await getMedusaHeaders();
 * const { products } = await sdk.store.product.list({}, headers);
 * ```
 */
export const sdk = new Proxy({} as InstanceType<typeof MedusaSDK>, {
  get(_target, prop: string) {
    const instance = getMedusaSdk();
    const value = instance[prop as keyof typeof instance];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
