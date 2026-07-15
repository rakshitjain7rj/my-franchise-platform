/**
 * Helpers for the franchise-wide "default store location" flag.
 *
 * At most one StoreLocation per franchise may have `is_default = true`.
 * When promoting a location, clear the flag on every sibling under the
 * same franchise so the invariant cannot be violated by concurrent edits.
 */

type FranchiseService = {
  listStoreLocations: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<Array<{ id: string; franchise_id?: string; is_default?: boolean }>>
  updateStoreLocations: (
    data: Array<Record<string, unknown>>
  ) => Promise<Array<Record<string, unknown>>>
}

/**
 * Promote `locationId` to the franchise default and demote every other
 * location under the same franchise. No-op siblings that are already false.
 *
 * @returns the updated default location row
 */
export async function setDefaultStoreLocation(
  franchiseService: FranchiseService,
  locationId: string,
  franchiseId: string
): Promise<Record<string, unknown>> {
  const siblings = await franchiseService.listStoreLocations({
    franchise_id: franchiseId,
  })

  const demotions = siblings
    .filter((loc) => loc.id !== locationId && loc.is_default)
    .map((loc) => ({ id: loc.id, is_default: false }))

  const updates = [...demotions, { id: locationId, is_default: true }]
  const result = await franchiseService.updateStoreLocations(updates)

  return result.find((row) => row.id === locationId) ?? result[result.length - 1]
}

/**
 * Clear the default flag on a location (no sibling promotion).
 */
export async function clearDefaultStoreLocation(
  franchiseService: FranchiseService,
  locationId: string
): Promise<Record<string, unknown>> {
  const result = await franchiseService.updateStoreLocations([
    { id: locationId, is_default: false },
  ])
  return result[0]
}
