/**
 * GET /store/dietary-tags
 *
 * Lists active dietary tags for the storefront filter UI (Eggless, etc.).
 * When `x-franchise-id` is present, only tags linked to at least one product
 * in that franchise are returned (empty claims stay hidden).
 */

import type { MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { TenantRequest } from "../../../utils/tenant-context"
import ProductDietaryTagLink from "../../../links/product-dietary-tag"
import FranchiseProductLink from "../../../links/franchise-product"

type DietaryTagDto = {
  id: string
  name: string
  slug: string
  description: string | null
}

export const GET = async (
  req: TenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const franchiseId = req.franchise_id

  const dietaryTagService = req.scope.resolve("dietary_tag") as {
    listDietary_tags: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        id: string
        name: string
        slug: string
        description: string | null
        is_active: boolean
      }>
    >
  }

  const allTags = await dietaryTagService.listDietary_tags(
    { is_active: true },
    { take: 100 }
  )

  if (!allTags?.length) {
    res.status(200).json({ dietary_tags: [] as DietaryTagDto[] })
    return
  }

  // Without franchise context, return every active tag.
  if (!franchiseId) {
    res.status(200).json({
      dietary_tags: allTags.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description ?? null,
      })),
    })
    return
  }

  // Franchise product allow-list
  const { data: franchiseLinks } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: { franchise_id: franchiseId },
  })

  const franchiseProductIds = new Set(
    (franchiseLinks as Array<{ product_id?: string }>)
      .map((l) => l.product_id)
      .filter((id): id is string => Boolean(id))
  )

  if (!franchiseProductIds.size) {
    res.status(200).json({ dietary_tags: [] as DietaryTagDto[] })
    return
  }

  // Which dietary tags are used by franchise products?
  const { data: dietLinks } = await query.graph({
    entity: ProductDietaryTagLink.entryPoint,
    fields: ["product_id", "dietary_tag_id"],
    filters: {
      dietary_tag_id: allTags.map((t) => t.id),
    },
  })

  const usedTagIds = new Set<string>()
  for (const link of (dietLinks ?? []) as Array<{
    product_id?: string
    dietary_tag_id?: string
  }>) {
    if (
      link.product_id &&
      link.dietary_tag_id &&
      franchiseProductIds.has(link.product_id)
    ) {
      usedTagIds.add(link.dietary_tag_id)
    }
  }

  const dietary_tags = allTags
    .filter((t) => usedTagIds.has(t.id))
    .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  res.status(200).json({ dietary_tags })
}
