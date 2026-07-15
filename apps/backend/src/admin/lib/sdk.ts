/**
 * sdk.ts  –  Medusa Admin SDK client with franchise-aware header injection.
 *
 * Strategy
 * --------
 * The `@medusajs/js-sdk` Medusa class accepts a `customHeaders` option in its
 * `client.fetch()` calls, but we need the header to be injected automatically
 * and reactively (i.e. it must reflect the *current* activeFranchiseId at the
 * moment of each request, not the one captured at module initialisation time).
 *
 * We achieve this by:
 *   1. Exporting the bare `sdk` instance for use in non-reactive code paths
 *      (e.g. outside React, server-side seeding, etc.).
 *   2. Exporting a `createFranchiseFetch` helper that wraps `sdk.client.fetch`
 *      and reads the active franchise ID from a provided getter function at
 *      call-time.
 *   3. Exporting a `useFranchiseFetch` React hook that composes the above
 *      with `useFranchise()` so components can obtain a fully instrumented
 *      fetch function with a single call.
 *
 * Why not monkey-patch `sdk.client.fetch` at module level?
 * ---------------------------------------------------------
 * The context value only becomes available after the React tree mounts.  A
 * module-level patch would capture `null` at import time.  The hook approach
 * ensures we always read the *live* context value via a closure that is
 * re-created whenever `activeFranchiseId` changes.
 */

import Medusa from "@medusajs/js-sdk"
import { useCallback } from "react"
import { useFranchise } from "../providers/FranchiseContext"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRANCHISE_HEADER = "x-franchise-id"

// ---------------------------------------------------------------------------
// Base SDK instance (unchanged from the original lib/sdk.ts)
// ---------------------------------------------------------------------------

export const sdk = new Medusa({
  baseUrl: import.meta.env.VITE_BACKEND_URL || "/",
  debug: import.meta.env.DEV,
  auth: {
    type: "session",
  },
})

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

// Mirror the signature of sdk.client.fetch so callers get full type-safety.
type FetchParameters = Parameters<typeof sdk.client.fetch>
type FetchReturn = ReturnType<typeof sdk.client.fetch>

type FetchOptions = FetchParameters[1]

// ---------------------------------------------------------------------------
// `createFranchiseFetch`
// ---------------------------------------------------------------------------

/**
 * Returns a `fetch` function that behaves exactly like `sdk.client.fetch` but
 * automatically injects the `x-franchise-id` header if `getFranchiseId`
 * returns a non-null value.
 *
 * @param getFranchiseId  A getter called at request time.  Typically a
 *                        closure over a React state ref or the context value.
 *
 * @example
 * // Outside React (e.g. in a utility module that holds a ref to the context):
 * let _activeFranchiseId: string | null = null
 * export const setGlobalFranchiseId = (id: string | null) => { _activeFranchiseId = id }
 * export const franchiseFetch = createFranchiseFetch(() => _activeFranchiseId)
 */
export function createFranchiseFetch(
  getFranchiseId: () => string | null
): (...args: FetchParameters) => FetchReturn {
  return (path: FetchParameters[0], options?: FetchOptions): FetchReturn => {
    const franchiseId = getFranchiseId()

    const headers: Record<string, string> =
      franchiseId ? { [FRANCHISE_HEADER]: franchiseId } : {}

    const mergedOptions: FetchOptions = {
      ...options,
      headers: {
        ...(options?.headers as Record<string, string> | undefined),
        ...headers,
      },
    }

    return sdk.client.fetch(path, mergedOptions)
  }
}

// ---------------------------------------------------------------------------
// `useFranchiseFetch`  –  the primary hook for use in admin UI components
// ---------------------------------------------------------------------------

/**
 * React hook that returns a fetch function pre-configured to inject the
 * `x-franchise-id` header with the currently active franchise ID.
 *
 * The returned function has an identical call signature to `sdk.client.fetch`,
 * so it is a drop-in replacement in any `useQuery` / `useMutation` call.
 *
 * @example
 * const franchiseFetch = useFranchiseFetch()
 *
 * const { data } = useQuery({
 *   queryKey: ["franchise-dashboard", activeFranchiseId],
 *   queryFn: () =>
 *     franchiseFetch("/admin/franchise-dashboard", {
 *       query: { limit: 10, offset: 0 },
 *     }),
 * })
 */
export function useFranchiseFetch(): (...args: FetchParameters) => FetchReturn {
  const { activeFranchiseId } = useFranchise()

  // Re-create the instrumented fetch only when the active ID changes.
  const franchiseFetch = useCallback(
    (path: FetchParameters[0], options?: FetchOptions): FetchReturn => {
      const headers: Record<string, string> = activeFranchiseId
        ? { [FRANCHISE_HEADER]: activeFranchiseId }
        : {}

      const mergedOptions: FetchOptions = {
        ...options,
        headers: {
          ...(options?.headers as Record<string, string> | undefined),
          ...headers,
        },
      }

      return sdk.client.fetch(path, mergedOptions)
    },
    [activeFranchiseId]
  )

  return franchiseFetch
}
