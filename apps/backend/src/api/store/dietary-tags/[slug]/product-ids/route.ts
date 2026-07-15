/**
 * GET /store/dietary-tags/:slug/product-ids
 *
 * Returns product IDs linked to the given dietary tag (by slug), optionally
 * intersected with the franchise allow-list from `x-franchise-id`.
 *
 * Used by the catalogue to apply server-side `id[]` filtering instead of
 * fetching the full catalogue and filtering in JS.
 */

import type { MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import type { TenantRequest } from "../../../../../utils/tenant-context"
import ProductDietaryTagLink from "../../../../../links/product-dietary-tag"
import FranchiseProductLink from "../../../../../links/franchise-product"

export const GET = async (
  req: TenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const slug = req.params?.slug?.trim().toLowerCase()
  if (!slug) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Dietary tag slug is required"
    )
  }

  const dietaryTagService = req.scope.resolve("dietary_tag") as {
    listDietary_tags: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ id: string; slug: string; is_active: boolean }>>
  }

  const [tag] = await dietaryTagService.listDietary_tags(
    { slug, is_active: true },
    { take: 1 }
  )

  if (!tag) {
    res.status(200).json({ product_ids: [] as string[], dietary_tag: null })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const franchiseId = req.franchise_id

  const { data: dietLinks } = await query.graph({
    entity: ProductDietaryTagLink.entryPoint,
    fields: ["product_id"],
    filters: { dietary_tag_id: tag.id },
  })

  let productIds = Array.from(
    new Set(
      (dietLinks as Array<{ product_id?: string }>)
        .map((l) => l.product_id)
        .filter((id): id is string => Boolean(id))
    )
  )

  if (franchiseId && productIds.length) {
    const { data: franchiseLinks } = await query.graph({
      entity: FranchiseProductLink.entryPoint,
      fields: ["product_id"],
      filters: {
        franchise_id: franchiseId,
        product_id: productIds,
      },
    })
    productIds = (franchiseLinks as Array<{ product_id?: string }>)
      .map((l) => l.product_id)
      .filter((id): id is string => Boolean(id))
  }

  res.status(200).json({
    dietary_tag: { id: tag.id, slug: tag.slug },
    product_ids: productIds,
  })
}
