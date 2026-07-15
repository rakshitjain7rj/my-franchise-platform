import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import FranchiseProductLink from "../links/franchise-product"
import {
  DEFAULT_OPENING_HOURS,
  expandDailyHours,
  resolveOpeningHours,
} from "../utils/logistics"

const REALISTIC_LOCATIONS = [
  // Amritsar
  [
    { name: "Cakery Amritsar - City Centre", code: "AMR-CC", latitude: 31.6340, longitude: 74.8723, address: "City Centre, Amritsar, Punjab 143001" },
    { name: "Cakery Amritsar - Mall of Amritsar", code: "AMR-MALL", latitude: 31.6163, longitude: 74.8732, address: "Mall of Amritsar, GT Road, Amritsar" },
    { name: "Cakery Amritsar - Ranjit Avenue", code: "AMR-RA", latitude: 31.6521, longitude: 74.8624, address: "B Block, Ranjit Avenue, Amritsar" },
    { name: "Cakery Amritsar - Lawrence Road", code: "AMR-LR", latitude: 31.6360, longitude: 74.8780, address: "Lawrence Road, Joshi Colony, Amritsar" },
    { name: "Cakery Amritsar - Civil Lines", code: "AMR-CL", latitude: 31.6425, longitude: 74.8778, address: "Civil Lines, Amritsar" },
  ],
  // Sirhind
  [
    { name: "Cakery Sirhind - Main Market", code: "SIR-MAIN", latitude: 30.6200, longitude: 76.3900, address: "Main Market, Sirhind, Punjab" },
    { name: "Cakery Sirhind - GT Road", code: "SIR-GT", latitude: 30.6150, longitude: 76.3950, address: "GT Road, Sirhind" },
    { name: "Cakery Sirhind - Model Town", code: "SIR-MT", latitude: 30.6250, longitude: 76.3850, address: "Model Town, Sirhind" },
    { name: "Cakery Sirhind - Station Road", code: "SIR-ST", latitude: 30.6300, longitude: 76.3800, address: "Station Road near Railway Station, Sirhind" },
    { name: "Cakery Sirhind - City Plaza", code: "SIR-CP", latitude: 30.6350, longitude: 76.3750, address: "City Plaza, Sirhind" },
  ],
  // Birmingham
  [
    { name: "Cakery Birmingham - Soho Road", code: "BHM-SOHO", latitude: 52.5002, longitude: -1.9322, address: "Soho Road, Handsworth, Birmingham B21" },
    { name: "Cakery Birmingham - Bullring", code: "BHM-BULL", latitude: 52.4779, longitude: -1.8934, address: "Bullring Shopping Centre, Birmingham B5 4BU" },
    { name: "Cakery Birmingham - Edgbaston", code: "BHM-EDG", latitude: 52.4681, longitude: -1.9202, address: "Edgbaston Village, Birmingham B15" },
    { name: "Cakery Birmingham - New Street", code: "BHM-NEW", latitude: 52.4796, longitude: -1.8981, address: "New Street, Birmingham City Centre B2 4ND" },
    { name: "Cakery Birmingham - Broad Street", code: "BHM-BRD", latitude: 52.4750, longitude: -1.9120, address: "Broad Street, Birmingham B1 2HF" },
  ],
  // London
  [
    { name: "Cakery London - Covent Garden", code: "LDN-COV", latitude: 51.5120, longitude: -0.1235, address: "Covent Garden, London WC2E 8BE" },
    { name: "Cakery London - Oxford Street", code: "LDN-OXF", latitude: 51.5149, longitude: -0.1448, address: "Oxford Street, London W1C 1JN" },
    { name: "Cakery London - Camden Market", code: "LDN-CAM", latitude: 51.5416, longitude: -0.1458, address: "Camden Market, London NW1 8AF" },
    { name: "Cakery London - Westfield", code: "LDN-WST", latitude: 51.5074, longitude: -0.2218, address: "Westfield, Ariel Way, London W12 7GF" },
    { name: "Cakery London - Canary Wharf", code: "LDN-CAN", latitude: 51.5054, longitude: -0.0235, address: "Canary Wharf, London E14 5AB" },
  ]
]

export default async function seedStoreLocations({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const franchiseService = container.resolve("franchise") as any

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info("  Store Locations Scaler Seeder")
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // 1. Fetch products linked to franchises
  const { data: productLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["franchise_id", "product_id"],
  })

  // Group by franchise
  const productsPerFranchise = productLinks.reduce((acc: Record<string, number>, link: any) => {
    if (link.franchise_id) {
      acc[link.franchise_id] = (acc[link.franchise_id] || 0) + 1
    }
    return acc
  }, {})

  // 2. Fetch all franchises
  const franchises = await franchiseService.listFranchises()
  
  if (franchises.length === 0) {
    logger.warn("⚠ No franchises found. Create franchises first.")
    return
  }

  let totalCreated = 0
  let totalBackfilled = 0

  for (let i = 0; i < franchises.length; i++) {
    const franchise = franchises[i]
    const productCount = productsPerFranchise[franchise.id] || 0

    if (productCount === 0 && !franchise.id.startsWith("01KVA")) {
      logger.info(`  ⏭ Skipping ${franchise.name || franchise.id} - No products linked.`)
      continue
    }

    // Check existing locations
    const existingLocations = await franchiseService.listStoreLocations({
      franchise_id: franchise.id
    })

    // ── Backfill: older seeds only wrote metadata.store_hours and left
    // opening_hours null, which made GET /store/stores/:id/slots return [].
    // Heal in place so re-seeding is not required for existing DBs.
    const needsHours = existingLocations.filter((loc: any) => {
      const resolved = resolveOpeningHours(loc.opening_hours, loc.metadata)
      // If we would fall through to platform default AND column is empty,
      // write a real column value (prefer legacy store_hours when present).
      const hasNative =
        loc.opening_hours &&
        typeof loc.opening_hours === "object" &&
        Object.keys(loc.opening_hours).length > 0
      return !hasNative
    })

    if (needsHours.length > 0) {
      for (const loc of needsHours) {
        const meta = (loc.metadata ?? {}) as Record<string, unknown>
        const raw = meta.store_hours as { open?: string; close?: string } | undefined
        const hours =
          raw?.open && raw?.close
            ? expandDailyHours(String(raw.open), String(raw.close))
            : DEFAULT_OPENING_HOURS
        await franchiseService.updateStoreLocations([
          {
            id: loc.id,
            opening_hours: hours,
            is_accepting_orders: loc.is_accepting_orders ?? true,
            custom_lead_time_hours: loc.custom_lead_time_hours ?? 24,
            daily_order_capacity: loc.daily_order_capacity ?? 10,
          },
        ])
      }
      totalBackfilled += needsHours.length
      logger.info(
        `  🔧 Backfilled opening_hours on ${needsHours.length} location(s) for ${franchise.name || franchise.id}`
      )
    }

    const existingCount = existingLocations.length
    if (existingCount >= 5) {
      logger.info(`  ℹ ${franchise.name || franchise.id} already has ${existingCount} locations. Skipping create.`)
      continue
    }

    const needed = 5 - existingCount
    logger.info(`  📍 ${franchise.name || franchise.id} has ${productCount} products but only ${existingCount} locations. Creating ${needed} new locations...`)

    // Pick the correct city block based on the franchise name or code
    let cityBlock = REALISTIC_LOCATIONS[2] // default to Birmingham
    const nameLower = (franchise.name || "").toLowerCase()
    const codeLower = (franchise.code || "").toLowerCase()
    
    if (nameLower.includes("amritsar") || codeLower.includes("amritsar")) {
      cityBlock = REALISTIC_LOCATIONS[0]
    } else if (nameLower.includes("sirhind") || codeLower.includes("sirhind")) {
      cityBlock = REALISTIC_LOCATIONS[1]
    } else if (nameLower.includes("london") || codeLower.includes("london")) {
      cityBlock = REALISTIC_LOCATIONS[3]
    }
    
    // Create 'needed' number of locations from this city block
    // We'll filter out names that already exist just to be safe
    const existingNames = new Set(existingLocations.map((l: any) => l.name))
    
    const locationsToCreate: any[] = []
    
    for (const geo of cityBlock) {
      if (locationsToCreate.length >= needed) break
      if (existingNames.has(geo.name)) continue
        
      const dayHours = { open: "08:00", close: "22:00" }
      // Keep capacity fields consistent: daily_order_capacity is the native
      // "orders per 30-min slot" column (see StoreLocation model). Do not
      // leave a conflicting max_orders_per_slot in metadata.
      const capacityPerSlot = 10
      locationsToCreate.push({
        name: geo.name,
        code: geo.code,
        address: geo.address,
        latitude: geo.latitude,
        longitude: geo.longitude,
        franchise_id: franchise.id,
        is_active: true,
        is_accepting_orders: true,
        custom_lead_time_hours: 24,
        daily_order_capacity: capacityPerSlot,
        // Native column used by GET /store/stores/:id/slots — must be set.
        // metadata.store_hours alone is not enough (historical bug).
        opening_hours: expandDailyHours(dayHours.open, dayHours.close),
        metadata: {
          store_hours: dayHours,
          max_orders_per_slot: capacityPerSlot,
          slot_duration_minutes: 30,
          prep_time_minutes: 45,
        },
      })
    }

    if (locationsToCreate.length > 0) {
      await franchiseService.createStoreLocations(locationsToCreate)
      totalCreated += locationsToCreate.length
      logger.info(`    ✅ Created ${locationsToCreate.length} locations for ${franchise.name || franchise.id}`)
    }
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  logger.info(
    `  ✅ Seeding Complete. Created: ${totalCreated}, opening_hours backfilled: ${totalBackfilled}`
  )
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
