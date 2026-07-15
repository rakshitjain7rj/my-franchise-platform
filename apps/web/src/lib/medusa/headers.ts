/**
 * src/lib/medusa/headers.ts
 *
 * Server-safe utility that builds the canonical set of HTTP headers required
 * by every Medusa Store API request in this storefront.
 *
 * Key guarantees:
 *  • Uses `next/headers` to read cookies — safe in React Server Components
 *    and Route Handlers, but gracefully degrades when called outside of a
 *    dynamic rendering context (e.g. during `next build` static generation).
 *  • Never throws. If `cookies()` is unavailable or the cookie is absent, the
 *    `x-franchise-id` header is simply omitted.
 *  • Always includes `x-publishable-api-key` from the environment so callers
 *    don't have to remember to add it manually.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The fully-formed header map returned by `getMedusaHeaders()`.
 * Extend this type if you add more canonical headers in the future.
 */
export type MedusaHeaders = {
  "Content-Type": "application/json";
  Accept: "application/json";
  "x-publishable-api-key": string;
  // `x-franchise-id` is conditionally added at runtime — kept as an index
  // signature so spread / Object.assign works without extra casting.
  [key: string]: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Safely calls `cookies()` from `next/headers`.
 *
 * In Next.js 14/15 the `cookies()` API throws when invoked outside of a
 * dynamic rendering scope (e.g. during static generation or in module scope).
 * We catch that error and return `null` so callers always get a stable result.
 */
async function safeReadCookies(): Promise<
  Awaited<ReturnType<typeof import("next/headers")["cookies"]>> | null
> {
  try {
    const { cookies } = await import("next/headers");
    // In Next.js 15 cookies() is async; in 14 it's sync. `await` handles both.
    return await cookies();
  } catch {
    // Outside dynamic context (static generation, module-level imports, tests).
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the canonical headers object for every Medusa Store API request.
 *
 * Call this at the top of any Server Component or Route Handler that talks
 * to Medusa. Pass the returned object directly to `fetch()` or the Medusa SDK.
 *
 * @example — Inside a React Server Component (native fetch)
 * ```ts
 * import { getMedusaHeaders } from "@/lib/medusa/headers";
 *
 * export default async function ProductsPage() {
 *   const headers = await getMedusaHeaders();
 *
 *   const res = await fetch(
 *     `${process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL}/store/products`,
 *     { headers, next: { revalidate: 60, tags: ["products"] } }
 *   );
 *   const { products } = await res.json();
 * }
 * ```
 *
 * @example — With the Medusa JS SDK
 * ```ts
 * import { getMedusaHeaders } from "@/lib/medusa/headers";
 * import { getMedusaSdk }     from "@/lib/medusa/sdk";
 *
 * export default async function ProductsPage() {
 *   const headers = await getMedusaHeaders();
 *   const sdk = getMedusaSdk();
 *
 *   const { products } = await sdk.store.product.list({}, headers);
 * }
 * ```
 *
 * @param extraHeaders - Optional headers merged in after the defaults.
 *   Useful for one-off overrides (e.g. a specific `cache-control` value).
 */
export async function getMedusaHeaders(
  extraHeaders?: Record<string, string>
): Promise<MedusaHeaders> {
  const publishableApiKey =
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_MEDUSA_API_KEY ??
    "";

  if (process.env.NODE_ENV === "development" && !publishableApiKey) {
    console.warn(
      "[getMedusaHeaders] NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is not set. " +
        "Requests to Medusa will likely fail authentication."
    );
  }

  const headers: MedusaHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-publishable-api-key": publishableApiKey,
    ...extraHeaders,
  };

  // Attempt to read the franchise cookie from the incoming request.
  const cookieStore = await safeReadCookies();
  const franchiseId = cookieStore?.get("franchise_id")?.value?.trim();

  if (franchiseId) {
    headers["x-franchise-id"] = franchiseId;
  }

  // Attempt to read the store-location cookie. When set (after the user picks
  // a store from the map-routing page / BakerySidebar), this is forwarded as
  // x-store-location-id so the backend's per-store product filtering is
  // activated automatically. `selected_store_location_id` is the canonical
  // cookie name — it's what MapRoutingShell, BakerySidebar, and cart-actions
  // already read/write.
  const storeLocationId = cookieStore
    ?.get("selected_store_location_id")
    ?.value?.trim();
  if (storeLocationId) {
    headers["x-store-location-id"] = storeLocationId;
  }

  // Attempt to read the customer's medusa_auth_token and inject it as Authorization header
  const customerToken = cookieStore?.get("medusa_auth_token")?.value?.trim();
  if (customerToken) {
    headers["Authorization"] = `Bearer ${customerToken}`;
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Synchronous variant (Client Components / browser-side utility contexts)
// ---------------------------------------------------------------------------

/**
 * Synchronous, browser-safe variant that reads `franchise_id` from
 * `document.cookie`. Returns the same header shape as `getMedusaHeaders()`.
 *
 * **Use this only in Client Components or browser-side code** where `async` is
 * not viable. For Server Components, always prefer `getMedusaHeaders()`.
 *
 * ⚠️ **This helper NEVER includes an `Authorization` header.** The customer
 * auth token (`medusa_auth_token`) is an httpOnly cookie by design — it is
 * invisible to `document.cookie`, so it *cannot* be read here. Any client-side
 * flow that needs an authenticated Medusa request MUST go through a Server
 * Action (see `src/lib/auth/auth-actions.ts`) or a Route Handler, where
 * `getMedusaHeaders()` reads the cookie via `next/headers` and attaches the
 * Bearer token. Do not re-add a `document.cookie` token read: it would only
 * work by downgrading the cookie to `httpOnly: false`, exposing the session
 * token to any XSS payload.
 *
 * @example
 * ```ts
 * // Inside a "use client" component — unauthenticated request only
 * const headers = getMedusaHeadersSync();
 * const res = await fetch("/api/something", { headers });
 * ```
 */
export function getMedusaHeadersSync(
  extraHeaders?: Record<string, string>
): MedusaHeaders {
  const publishableApiKey =
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_MEDUSA_API_KEY ??
    "";

  const headers: MedusaHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-publishable-api-key": publishableApiKey,
    ...extraHeaders,
  };

  if (typeof document !== "undefined") {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith("franchise_id="));

    const franchiseId = match?.split("=")[1];
    if (franchiseId) {
      headers["x-franchise-id"] = decodeURIComponent(franchiseId).trim();
    }

    // Forward the store-location cookie for per-store product filtering.
    const storeMatch = document.cookie
      .split("; ")
      .find((row) => row.startsWith("selected_store_location_id="));

    const storeLocationId = storeMatch?.split("=")[1];
    if (storeLocationId) {
      headers["x-store-location-id"] = decodeURIComponent(storeLocationId).trim();
    }

    // NOTE: `medusa_auth_token` is deliberately NOT read here. It is httpOnly
    // (see auth-actions.ts) and therefore unreadable from document.cookie — a
    // read attempt would silently produce unauthenticated requests. See the
    // JSDoc above for the required Server Action pattern.
  }

  return headers;
}
