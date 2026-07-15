import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * seed-franchise-geo.ts
 *
 * Populates latitude, longitude, and address on existing franchise records
 * so the location-picker map can display real marker positions.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/seed-franchise-geo.ts
 *
 * The script detects existing franchises and assigns geo coordinates to them
 * in order. If fewer than 4 franchises exist, only the available ones are
 * updated. This is safe to re-run (idempotent).
 */

interface GeoSeed {
  latitude: number
  longitude: number
  address: string
}

/**
 * Default geo data for demo / development.
 * These Birmingham (UK) coordinates match the original hardcoded demo data
 * that was previously embedded in the map-routing page's getDemoData().
 */
const GEO_DATA: GeoSeed[] = [
  {
    latitude: 52.5002,
    longitude: -1.9322,
    address: "Soho Road, Handsworth, Birmingham",
  },
  {
    latitude: 52.4779,
    longitude: -1.8934,
    address: "Bullring Shopping Centre, Birmingham",
  },
  {
    latitude: 52.4681,
    longitude: -1.9202,
    address: "Edgbaston Village, Birmingham",
  },
  {
    latitude: 52.4796,
    longitude: -1.8981,
    address: "New Street, Birmingham City Centre",
  },
]

export default async function seedFranchiseGeo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const franchiseService = container.resolve("franchise") as {
    listFranchises: () => Promise<Array<{ id: string; name: string }>>
    updateFranchises: (
      data: Array<{ id: string; latitude: number; longitude: number; address: string }>
    ) => Promise<unknown>
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Franchise Geo-Data Seeder")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  const franchises = await franchiseService.listFranchises()

  if (franchises.length === 0) {
    logger.warn("⚠ No franchises found. Create franchises first, then re-run.")
    return
  }

  logger.info(`Found ${franchises.length} franchise(s). Assigning geo data…\n`)

  const updates: Array<{
    id: string
    latitude: number
    longitude: number
    address: string
  }> = []

  for (let i = 0; i < franchises.length; i++) {
    const franchise = franchises[i]
    const geo = GEO_DATA[i % GEO_DATA.length] // cycle through available coords

    updates.push({
      id: franchise.id,
      latitude: geo.latitude,
      longitude: geo.longitude,
      address: geo.address,
    })

    logger.info(
      `  📍 ${franchise.name} → (${geo.latitude}, ${geo.longitude}) — ${geo.address}`
    )
  }

  await franchiseService.updateFranchises(updates)

  logger.info("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(`  ✅ Updated ${updates.length} franchise(s) with geo data`)
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
