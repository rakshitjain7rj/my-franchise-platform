import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const queryRunner: any = req.scope.resolve("manager") // TypeORM/MikroORM manager

    const stockLocationId = "sloc_01KS7ZVM6T766TM2GD90W4V9Q9"

    const storeIds = [
      "loc_01KSMMJ346PVFAN9G0ZNCDZ8E7",
      "loc_01KVA1YYMGRBTV46R63QDT0FV9",
      "loc_01KVA1YYMGRBTV46R63QDT0FW1",
      "loc_01KVA1YYMGRBTV46R63QDT0FW2",
      "loc_01KVA1YYMGRBTV46R63QDT0FW3",
      "loc_01KVA1YYMGRBTV46R63QDT0FW0",
      "01KVFWFXMYRY0RQ01H3WFQR2PV",
      "01KVFWFXMZK8Q0K821VA216MVZ",
      "01KVFWFXMZK2GGQP5JRQNHKKCS",
      "01KVFWFXMZK8RPV5JRGW2RWHW1"
    ]

    let linked = 0
    const errors: any[] = []

    for (const storeId of storeIds) {
      try {
        // Check if already linked
        const existing = await queryRunner.query(`
          SELECT 1 FROM franchise_store_location_stock_location_stock_location 
          WHERE store_location_id = $1 LIMIT 1
        `, [storeId])

        if (existing.length > 0) {
          console.log(`Already linked: ${storeId}`)
          continue
        }

        // Insert link
        await queryRunner.query(`
          INSERT INTO franchise_store_location_stock_location_stock_location 
            (id, store_location_id, stock_location_id, created_at, updated_at)
          VALUES ('link_' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 20), $1, $2, NOW(), NOW())
          ON CONFLICT DO NOTHING
        `, [storeId, stockLocationId])

        linked++
        console.log(`✅ Linked: ${storeId}`)
      } catch (err: any) {
        errors.push({ storeId, error: err.message })
      }
    }

    res.json({
      success: true,
      message: "Direct linking completed",
      linked_count: linked,
      total_attempted: storeIds.length,
      errors
    })
  } catch (error: any) {
    console.error(error)
    res.status(500).json({ success: false, error: error.message })
  }
}