import { ExecArgs } from "@medusajs/framework/types"

/**
 * seed-test-franchises.ts
 *
 * Upserts all franchise records with full location data (name, code,
 * latitude, longitude, address, hours) so the /store/franchises endpoint
 * returns real pins for the map-routing page instead of falling back to
 * demo data.
 *
 * Run with:
 *   npx medusa exec src/scripts/seed-test-franchises.ts
 *   (from the apps/backend directory)
 *
 * The script is idempotent — re-running it simply updates existing rows.
 */
export default async function seedTestFranchises({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const pgConnection = container.resolve("__pg_connection__")

  logger.info("Starting franchise location seed …")

  // ── Franchise definitions ────────────────────────────────────────────────
  // Edit this array to match your real locations.  The `id` values are stable
  // primary keys; change them only if you need to create brand-new rows.
  // IDs are hardcoded 26-character ULIDs so they pass the frontend ULID/UUID
  // regex guard (e.g., middleware.ts or franchise-scoped fetch helpers).
  const franchises = [
    {
      id: "01KVA1YYMGRBTV46R63QDT0FV9",
      name: "Flagship Downtown Bakery",
      code: "flagship",
      is_active: true,
      latitude: 52.4796,
      longitude: -1.8981,
      address: "New Street, Birmingham City Centre, B2 4RX",
      hours: "9:00 AM - 6:00 PM",
    },
    {
      id: "01KVA1YYMGRBTV46R63QDT0FW0",
      name: "Cakery Amritsar",
      code: "amritsar",
      is_active: true,
      latitude: 31.634,
      longitude: 74.8723,
      address: "Lawrence Road, Amritsar, Punjab 143001",
      hours: "9:00 AM - 6:00 PM",
    },
    {
      id: "01KVA1YYMGRBTV46R63QDT0FW1",
      name: "Cakery Sirhind",
      code: "sirhind",
      is_active: true,
      latitude: 30.6273,
      longitude: 76.3901,
      address: "GT Road, Sirhind, Punjab 140406",
      hours: "9:00 AM - 6:00 PM",
    },
    {
      id: "01KVA1YYMGRBTV46R63QDT0FW2",
      name: "Birmingham Soho Road",
      code: "soho",
      is_active: true,
      latitude: 52.5002,
      longitude: -1.9322,
      address: "Soho Road, Handsworth, Birmingham, B21 9BT",
      hours: "9:00 AM - 6:00 PM",
    },
    {
      id: "01KVA1YYMGRBTV46R63QDT0FW3",
      name: "Bullring Kiosk",
      code: "bullring",
      is_active: true,
      latitude: 52.4779,
      longitude: -1.8934,
      address: "Bullring Shopping Centre, Birmingham, B5 4BU",
      hours: "9:00 AM - 6:00 PM",
    },
  ]

  // ── Upsert ───────────────────────────────────────────────────────────────
  try {
    for (const f of franchises) {
      await pgConnection.raw(
        `
        INSERT INTO franchise
          (id, name, code, is_active, latitude, longitude, address, hours, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          name       = EXCLUDED.name,
          code       = EXCLUDED.code,
          is_active  = EXCLUDED.is_active,
          latitude   = EXCLUDED.latitude,
          longitude  = EXCLUDED.longitude,
          address    = EXCLUDED.address,
          hours      = EXCLUDED.hours,
          updated_at = NOW();
        `,
        [
          f.id,
          f.name,
          f.code,
          f.is_active,
          f.latitude,
          f.longitude,
          f.address,
          f.hours,
        ]
      )
      logger.info(`  ✓ Upserted franchise: ${f.name} (${f.id})`)
    }

    logger.info(`\nFranchise seed complete — ${franchises.length} locations ready.`)
    logger.info("Restart the backend for the /store/franchises endpoint to reflect the new data.")
  } catch (error) {
    logger.error(`Seeding failed: ${(error as Error).message}`)
    throw error
  }
}