/**
 * Bridge so the cake fulfillment provider can use the app-level Query
 * service. ModuleProvider cradles often omit `query` even though API routes
 * resolve it fine (see calculatePrice → "query service missing" in production).
 *
 * Bound once from `src/loaders/cake-fulfillment-query.ts` at boot.
 */

type GraphQuery = {
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

export function getBoundCakeFulfillmentQuery(): GraphQuery | null {
  return boundQuery
}
