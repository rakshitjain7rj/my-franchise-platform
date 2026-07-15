import type { MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { IProductModuleService } from "@medusajs/framework/types"
import type { TenantRequest } from "../../../utils/tenant-context"
import { buildTenantFilter } from "../../../utils/tenant-context"
import FranchiseProductLink from "../../../links/franchise-product"

export const GET = async (req: TenantRequest, res: MedusaResponse) => {
  const productModuleService = req.scope.resolve<IProductModuleService>("product")
  const franchiseFilter = buildTenantFilter(req)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // The franchise-product link table is the single source of truth for
  // ownership (the former `metadata.franchise_ids` fallback was retired once the
  // link became many-to-many — see `backfill-franchise-product-links.ts`).
  const { data: franchiseProducts } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: franchiseFilter,
  })

  const productIds = Array.from(
    new Set(
      franchiseProducts
        .map((link: { product_id?: string }) => link.product_id)
        .filter((productId): productId is string => Boolean(productId))
    )
  )

  if (!productIds.length) {
    res.json({ products: [] })
    return
  }

  const products = await productModuleService.listProducts({
    id: productIds,
  })

  res.json({ products })
}
