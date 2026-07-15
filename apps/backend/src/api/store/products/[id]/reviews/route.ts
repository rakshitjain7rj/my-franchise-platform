/**
 * GET  /store/products/:id/reviews  — approved reviews + aggregate rating
 * POST /store/products/:id/reviews  — submit a review (status = pending)
 *
 * Tenant isolation: product must belong to the x-franchise-id franchise.
 * Empty allow-lists short-circuit (never query with id:[]).
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import type { TenantRequest } from "../../../../../utils/tenant-context"
import FranchiseProductLink from "../../../../../links/franchise-product"
import ProductReviewLink from "../../../../../links/product-review"
import { PRODUCT_REVIEW_MODULE } from "../../../../../modules/product_review"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReviewStatus = "pending" | "approved" | "rejected"

type ProductReviewRow = {
  id: string
  rating: number
  title: string | null
  content: string
  nickname: string
  customer_id: string | null
  email: string | null
  status: ReviewStatus
  is_verified_purchase: boolean
  created_at: string | Date
}

type ReviewService = {
  listProduct_reviews: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<ProductReviewRow[]>
  createProduct_reviews: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<ProductReviewRow | ProductReviewRow[]>
}

type PublicReview = {
  id: string
  rating: number
  title: string | null
  content: string
  nickname: string
  is_verified_purchase: boolean
  created_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const assertProductInFranchise = async (
  req: TenantRequest,
  productId: string
): Promise<boolean> => {
  const franchiseId = req.franchise_id
  if (!franchiseId) return true // franchise middleware already enforced for /store/*

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: ownership } = await query.graph({
    entity: FranchiseProductLink.entryPoint,
    fields: ["product_id"],
    filters: { franchise_id: franchiseId, product_id: productId },
  })
  return Boolean(ownership?.length)
}

const listReviewIdsForProduct = async (
  req: MedusaRequest,
  productId: string
): Promise<string[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: links } = await query.graph({
    entity: ProductReviewLink.entryPoint,
    fields: ["product_review_id"],
    filters: { product_id: productId },
  })

  return Array.from(
    new Set(
      (links as Array<{ product_review_id?: string }>)
        .map((l) => l.product_review_id)
        .filter((id): id is string => Boolean(id))
    )
  )
}

const toPublic = (r: ProductReviewRow): PublicReview => ({
  id: r.id,
  rating: Number(r.rating),
  title: r.title ?? null,
  content: r.content,
  nickname: r.nickname,
  is_verified_purchase: Boolean(r.is_verified_purchase),
  created_at:
    r.created_at instanceof Date
      ? r.created_at.toISOString()
      : String(r.created_at),
})

const clampRating = (raw: unknown): number | null => {
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded < 1 || rounded > 5) return null
  return rounded
}

// ---------------------------------------------------------------------------
// GET — approved reviews + summary
// ---------------------------------------------------------------------------

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

  if (!(await assertProductInFranchise(req, productId))) {
    res.status(200).json({
      reviews: [],
      count: 0,
      average_rating: null,
      rating_breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    })
    return
  }

  const reviewIds = await listReviewIdsForProduct(req, productId)

  // Empty allow-list short-circuit
  if (!reviewIds.length) {
    res.status(200).json({
      reviews: [],
      count: 0,
      average_rating: null,
      rating_breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    })
    return
  }

  const reviewService = req.scope.resolve(
    PRODUCT_REVIEW_MODULE
  ) as ReviewService

  const limit = Math.min(
    Math.max(parseInt(String(req.query?.limit ?? "20"), 10) || 20, 1),
    50
  )
  const offset = Math.max(
    parseInt(String(req.query?.offset ?? "0"), 10) || 0,
    0
  )

  const allApproved = await reviewService.listProduct_reviews(
    { id: reviewIds, status: "approved" },
    {
      take: reviewIds.length,
      order: { created_at: "DESC" },
    }
  )

  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<
    1 | 2 | 3 | 4 | 5,
    number
  >
  let sum = 0
  for (const r of allApproved) {
    const rating = Math.min(5, Math.max(1, Math.round(Number(r.rating)))) as
      | 1
      | 2
      | 3
      | 4
      | 5
    breakdown[rating] = (breakdown[rating] ?? 0) + 1
    sum += rating
  }

  const count = allApproved.length
  const average_rating =
    count > 0 ? Math.round((sum / count) * 10) / 10 : null

  const page = allApproved.slice(offset, offset + limit).map(toPublic)

  res.status(200).json({
    reviews: page,
    count,
    limit,
    offset,
    average_rating,
    rating_breakdown: breakdown,
  })
}

// ---------------------------------------------------------------------------
// POST — submit for moderation
// ---------------------------------------------------------------------------

export const POST = async (
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

  if (!(await assertProductInFranchise(req, productId))) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Product not found for this franchise"
    )
  }

  // Confirm the product exists in the Product module
  const productModule = req.scope.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ id: string }>>
  }
  const [product] = await productModule.listProducts(
    { id: productId },
    { take: 1 }
  )
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  }

  const body = (req.body ?? {}) as Record<string, unknown>

  const rating = clampRating(body.rating)
  if (rating == null) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "rating must be an integer between 1 and 5"
    )
  }

  const nickname =
    typeof body.nickname === "string" ? body.nickname.trim() : ""
  if (!nickname || nickname.length > 50) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "nickname is required (max 50 characters)"
    )
  }

  const content =
    typeof body.content === "string" ? body.content.trim() : ""
  if (!content || content.length > 2000) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "content is required (max 2000 characters)"
    )
  }

  let title: string | null = null
  if (typeof body.title === "string" && body.title.trim()) {
    title = body.title.trim().slice(0, 100)
  }

  let email: string | null = null
  if (typeof body.email === "string" && body.email.trim()) {
    email = body.email.trim().slice(0, 254)
  }

  // Optional customer session (middleware does not force auth on this route)
  const customerId =
    (req as MedusaRequest & { auth_context?: { actor_id?: string } })
      .auth_context?.actor_id ?? null

  const reviewService = req.scope.resolve(
    PRODUCT_REVIEW_MODULE
  ) as ReviewService

  const created = await reviewService.createProduct_reviews({
    rating,
    title,
    content,
    nickname,
    email,
    customer_id: customerId,
    status: "pending",
    is_verified_purchase: false,
  })

  const review = Array.isArray(created) ? created[0] : created

  const remoteLink = req.scope.resolve("remoteLink") as {
    create: (links: Record<string, unknown> | Record<string, unknown>[]) => Promise<unknown>
  }

  await remoteLink.create({
    [Modules.PRODUCT]: { product_id: productId },
    product_review: { product_review_id: review.id },
  })

  res.status(201).json({
    review: {
      id: review.id,
      status: review.status,
      // Do not echo as approved — set expectations for moderation
      message:
        "Thank you! Your review has been submitted and will appear once approved.",
    },
  })
}
