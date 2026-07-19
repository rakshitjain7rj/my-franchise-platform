/**
 * Bridge so the cake fulfillment provider can use the app-level Query
 * service. ModuleProvider cradles often omit `query` even though API routes
 * resolve it fine (see calculatePrice → "query service missing" in production).
 *
 * Binding sites (last successful bind wins; idempotent):
 *  1. Boot: `src/loaders/cake-fulfillment-query.ts`
 *  2. Request: `franchiseTenantMiddleware` on store paths after Query resolve
 */

export type GraphQuery = {
  graph: (args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => Promise<{ data: unknown[] }>
}

let boundQuery: GraphQuery | null = null

export function bindCakeFulfillmentQuery(query: GraphQuery | null | undefined) {
  if (query && typeof query.graph === "function") {
    boundQuery = query
  }
}

/** Test helper — clears the process-global bind. */
export function clearBoundCakeFulfillmentQuery() {
  boundQuery = null
}

export function getBoundCakeFulfillmentQuery(): GraphQuery | null {
  return boundQuery
}
