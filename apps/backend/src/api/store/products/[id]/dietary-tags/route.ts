/**
 * GET /store/products/:id/dietary-tags
 *
 * Returns the dietary tags linked to a product via the existing
 * product-dietary-tag relation (mirrors dietary_tag module — no new model).
 *
 * Tenant isolation: when x-franchise-id is present, the product must be linked
 * to that franchise via franchise-product. Empty allow-lists short-circuit.
 */

import type { MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import type { TenantRequest } from "../../../../../utils/tenant-context"
import ProductDietaryTagLink from "../../../../../links/product-dietary-tag"
import FranchiseProductLink from "../../../../../links/franchise-product"

type DietaryTagDto = {
  id: string
  name: string
  slug: string
  description: string | null
  is_active: boolean
}

export const GET = async (
  req: TenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const productId = req.params?.id
  if (!productId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Product id is required"
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const franchiseId = req.franchise_id

  // ── Tenant check: product must belong to the requesting franchise ─────────
  if (franchiseId) {
    const { data: ownership } = await query.graph({
      entity: FranchiseProductLink.entryPoint,
      fields: ["product_id"],
      filters: { franchise_id: franchiseId, product_id: productId },
    })

    if (!ownership?.length) {
      res.status(200).json({ dietary_tags: [] as DietaryTagDto[] })
      return
    }
  }

  // ── Resolve linked tag ids ────────────────────────────────────────────────
  const { data: links } = await query.graph({
    entity: ProductDietaryTagLink.entryPoint,
    fields: ["dietary_tag_id"],
    filters: { product_id: productId },
  })

  const tagIds = Array.from(
    new Set(
      (links as Array<{ dietary_tag_id?: string }>)
        .map((l) => l.dietary_tag_id)
        .filter((id): id is string => Boolean(id))
    )
  )

  // Empty allow-list short-circuit — never query with id:[]
  if (!tagIds.length) {
    res.status(200).json({ dietary_tags: [] as DietaryTagDto[] })
    return
  }

  const dietaryTagService = req.scope.resolve("dietary_tag") as {
    listDietary_tags: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<DietaryTagDto[]>
  }

  const tags = await dietaryTagService.listDietary_tags(
    { id: tagIds, is_active: true },
    { take: tagIds.length }
  )

  res.status(200).json({
    dietary_tags: (tags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description ?? null,
      is_active: Boolean(t.is_active),
    })),
  })
}
