/**
 * POST /admin/product-reviews/:id
 *
 * Moderate a review — set status to approved | rejected.
 * Medusa admin UPDATE convention: POST (not PATCH) on /:id.
 *
 * Body: { status: "approved" | "rejected" }
 *
 * Franchise admins may only moderate reviews linked to products they own.
 */

import type { MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  type AuthenticatedTenantRequest,
} from "../../../../utils/tenant-context"
import FranchiseProductLink from "../../../../links/franchise-product"
import ProductReviewLink from "../../../../links/product-review"
import { PRODUCT_REVIEW_MODULE } from "../../../../modules/product_review"

type ReviewStatus = "pending" | "approved" | "rejected"

type ProductReviewRow = {
  id: string
  rating: number
  title: string | null
  content: string
  nickname: string
  status: ReviewStatus
  is_verified_purchase: boolean
  created_at: string | Date
}

type ReviewService = {
  listProduct_reviews: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<ProductReviewRow[]>
  updateProduct_reviews: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<ProductReviewRow | ProductReviewRow[]>
}

const assertCanModerate = async (
  req: AuthenticatedTenantRequest,
  reviewId: string
): Promise<string | null> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: links } = await query.graph({
    entity: ProductReviewLink.entryPoint,
    fields: ["product_id", "product_review_id"],
    filters: { product_review_id: reviewId },
  })

  const productId = (links as Array<{ product_id?: string }>)[0]?.product_id
  if (!productId) {
    // Orphan review — super admin may still act; franchise admin cannot
    try {
      await resolveAdminFranchiseIds(req)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Review is not linked to a product in your franchise"
      )
    } catch (err) {
      if (
        err instanceof MedusaError &&
        err.type === MedusaError.Types.NOT_ALLOWED
      ) {
        return null // super admin
      }
      throw err
    }
  }

  try {
    const franchiseIds = await resolveAdminFranchiseIds(req)
    if (!franchiseIds.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "No franchise context"
      )
    }

    const { data: ownership } = await query.graph({
      entity: FranchiseProductLink.entryPoint,
      fields: ["product_id"],
      filters: { franchise_id: franchiseIds, product_id: productId },
    })

    if (!ownership?.length) {
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "You are not authorized to moderate this review"
      )
    }
    return productId
  } catch (err) {
    if (
      err instanceof MedusaError &&
      err.type === MedusaError.Types.NOT_ALLOWED
    ) {
      return productId // super admin
    }
    throw err
  }
}

export const POST = async (
  req: AuthenticatedTenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const reviewId = req.params?.id
  if (!reviewId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Review id is required"
    )
  }

  const body = (req.body ?? {}) as { status?: string }
  const nextStatus = body.status

  if (nextStatus !== "approved" && nextStatus !== "rejected") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'status must be "approved" or "rejected"'
    )
  }

  const reviewService = req.scope.resolve(
    PRODUCT_REVIEW_MODULE
  ) as ReviewService

  const [existing] = await reviewService.listProduct_reviews(
    { id: reviewId },
    { take: 1 }
  )

  if (!existing) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Review not found")
  }

  await assertCanModerate(req, reviewId)

  const updated = await reviewService.updateProduct_reviews({
    id: reviewId,
    status: nextStatus,
  })

  const row = Array.isArray(updated) ? updated[0] : updated

  res.status(200).json({
    review: {
      id: row.id,
      status: row.status,
      rating: Number(row.rating),
      title: row.title ?? null,
      content: row.content,
      nickname: row.nickname,
      is_verified_purchase: Boolean(row.is_verified_purchase),
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    },
  })
}
