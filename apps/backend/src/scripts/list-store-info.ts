import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function listStoreInfo({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const regionService = container.resolve(Modules.REGION)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)

  console.log("\n=== REGIONS ===")
  const regions = await regionService.listRegions()
  console.table(regions.map(r => ({ id: r.id, name: r.name, currency_code: r.currency_code })))

  console.log("\n=== SALES CHANNELS ===")
  const salesChannels = await salesChannelService.listSalesChannels()
  console.table(salesChannels.map(sc => ({ id: sc.id, name: sc.name })))

  console.log("\n=== STORES ===")
  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["id", "name", "supported_currencies.currency_code", "supported_currencies.is_default"]
  })
  console.log(JSON.stringify(stores, null, 2))
}
