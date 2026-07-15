import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * GET /store/franchises/:id/default-location
 *
 * Returns the franchise's default StoreLocation (is_default = true and active),
 * used by the storefront to pre-select a bakery for first-time visitors who
 * have not yet chosen a store.
 *
 * Response shapes:
 *   { location: { id, name, code, address, ... } }  — when a default exists
 *   { location: null }                               — no default configured
 *
 * This route is under /store/franchises/* so it inherits the normal store
 * middleware stack; the franchise id comes from the path, not the header.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id: franchiseId } = req.params as { id: string }
  const franchiseService = req.scope.resolve("franchise") as {
    listStoreLocations: (
      filters: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<Record<string, unknown>>>
  }

  // Prefer an explicitly marked default that is still active/visible.
  const defaults = await franchiseService.listStoreLocations(
    {
      franchise_id: franchiseId,
      is_default: true,
      is_active: true,
    },
    {
      select: [
        "id",
        "name",
        "code",
        "address",
        "latitude",
        "longitude",
        "is_active",
        "is_accepting_orders",
        "is_default",
        "franchise_id",
      ],
      take: 1,
    }
  )

  if (defaults.length > 0) {
    res.json({ location: defaults[0] })
    return
  }

  // Soft fallback: if no default is marked, use the first active location so
  // brand-new deployments still get a sensible pre-selection without requiring
  // a manual admin click. Operators can still override by setting is_default.
  const active = await franchiseService.listStoreLocations(
    {
      franchise_id: franchiseId,
      is_active: true,
    },
    {
      select: [
        "id",
        "name",
        "code",
        "address",
        "latitude",
        "longitude",
        "is_active",
        "is_accepting_orders",
        "is_default",
        "franchise_id",
      ],
      take: 1,
      order: { created_at: "ASC" },
    }
  )

  res.json({ location: active[0] ?? null })
}
