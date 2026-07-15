/**
 * GET /admin/product-reviews
 *
 * Franchise-scoped review moderation queue.
 * Super admins (no franchise-user link) see everything.
 *
 * Query params:
 *   - status   : pending | approved | rejected (default: pending)
 *   - product_id : optional filter
 *   - limit / offset
 *
 * Empty allow-lists short-circuit (never query with id:[]).
 */

import type { MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  type AuthenticatedTenantRequest,
} from "../../../utils/tenant-context"
import FranchiseProductLink from "../../../links/franchise-product"
import ProductReviewLink from "../../../links/product-review"
import { PRODUCT_REVIEW_MODULE } from "../../../modules/product_review"

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
  updated_at?: string | Date
}

type ReviewService = {
  listProduct_reviews: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<ProductReviewRow[]>
}

const VALID_STATUSES = new Set<ReviewStatus>([
  "pending",
  "approved",
  "rejected",
])

const EMPTY = { reviews: [], count: 0, limit: 0, offset: 0 }

/**
 * Super admin → null (unrestricted).
 * Franchise admin → product id allow-list for their franchise(s).
 * Empty franchise → empty product list (caller short-circuits).
 */
const resolveAllowedProductIds = async (
  req: AuthenticatedTenantRequest
): Promise<string[] | null> => {
  try {
    const franchiseIds = await resolveAdminFranchiseIds(req)
    if (!franchiseIds.length) return []

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: links } = await query.graph({
      entity: FranchiseProductLink.entryPoint,
      fields: ["product_id"],
      filters: { franchise_id: franchiseIds },
    })

    return Array.from(
      new Set(
        (links as Array<{ product_id?: string }>)
          .map((l) => l.product_id)
          .filter((id): id is string => Boolean(id))
      )
    )
  } catch (err) {
    if (
      err instanceof MedusaError &&
      err.type === MedusaError.Types.NOT_ALLOWED
    ) {
      // Super admin — no franchise-user links
      return null
    }
    throw err
  }
}

export const GET = async (
  req: AuthenticatedTenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const statusParam =
    typeof req.query?.status === "string" ? req.query.status : "pending"
  const status = (
    VALID_STATUSES.has(statusParam as ReviewStatus) ? statusParam : "pending"
  ) as ReviewStatus

  const productIdFilter =
    typeof req.query?.product_id === "string" ? req.query.product_id : undefined

  const limit = Math.min(
    Math.max(parseInt(String(req.query?.limit ?? "50"), 10) || 50, 1),
    200
  )
  const offset = Math.max(
    parseInt(String(req.query?.offset ?? "0"), 10) || 0,
    0
  )

  const allowedProductIds = await resolveAllowedProductIds(req)

  // Empty product allow-list → no reviews visible
  if (allowedProductIds !== null && !allowedProductIds.length) {
    res.status(200).json(EMPTY)
    return
  }

  if (
    productIdFilter &&
    allowedProductIds !== null &&
    !allowedProductIds.includes(productIdFilter)
  ) {
    res.status(200).json(EMPTY)
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Resolve review ids from the product-review link, scoped to allowed products
  const linkFilters: Record<string, unknown> = {}
  if (productIdFilter) {
    linkFilters.product_id = productIdFilter
  } else if (allowedProductIds !== null) {
    linkFilters.product_id = allowedProductIds
  }

  // Super admin with no product filter: still need all links (or list all reviews)
  let reviewIds: string[] | null = null
  let productIdByReviewId = new Map<string, string>()

  if (Object.keys(linkFilters).length > 0) {
    const { data: links } = await query.graph({
      entity: ProductReviewLink.entryPoint,
      fields: ["product_id", "product_review_id"],
      filters: linkFilters,
    })

    productIdByReviewId = new Map(
      (links as Array<{ product_id?: string; product_review_id?: string }>)
        .filter((l) => l.product_id && l.product_review_id)
        .map((l) => [l.product_review_id!, l.product_id!])
    )

    reviewIds = Array.from(productIdByReviewId.keys())

    if (!reviewIds.length) {
      res.status(200).json(EMPTY)
      return
    }
  } else {
    // Super admin, no product filter — load links for product titles later
    const { data: links } = await query.graph({
      entity: ProductReviewLink.entryPoint,
      fields: ["product_id", "product_review_id"],
    })
    productIdByReviewId = new Map(
      (links as Array<{ product_id?: string; product_review_id?: string }>)
        .filter((l) => l.product_id && l.product_review_id)
        .map((l) => [l.product_review_id!, l.product_id!])
    )
  }

  const reviewService = req.scope.resolve(
    PRODUCT_REVIEW_MODULE
  ) as ReviewService

  const filters: Record<string, unknown> = { status }
  if (reviewIds !== null) {
    filters.id = reviewIds
  }

  // Fetch a wider window then page in-memory when we have an id filter;
  // for unrestricted super-admin lists, use service pagination.
  const take = reviewIds !== null ? Math.min(reviewIds.length, 500) : limit
  const skip = reviewIds !== null ? 0 : offset

  const rows = await reviewService.listProduct_reviews(filters, {
    take,
    skip,
    order: { created_at: "DESC" },
  })

  let page = rows
  let count = rows.length

  if (reviewIds !== null) {
    count = rows.length
    page = rows.slice(offset, offset + limit)
  }

  // Resolve product titles for the page
  const productIds = Array.from(
    new Set(
      page
        .map((r) => productIdByReviewId.get(r.id))
        .filter((id): id is string => Boolean(id))
    )
  )

  const productTitleById = new Map<string, string>()
  if (productIds.length) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title"],
      filters: { id: productIds },
    })
    for (const p of products as Array<{ id: string; title?: string }>) {
      productTitleById.set(p.id, p.title ?? p.id)
    }
  }

  res.status(200).json({
    reviews: page.map((r) => {
      const productId = productIdByReviewId.get(r.id) ?? null
      return {
        id: r.id,
        rating: Number(r.rating),
        title: r.title ?? null,
        content: r.content,
        nickname: r.nickname,
        email: r.email ?? null,
        customer_id: r.customer_id ?? null,
        status: r.status,
        is_verified_purchase: Boolean(r.is_verified_purchase),
        product_id: productId,
        product_title: productId
          ? (productTitleById.get(productId) ?? null)
          : null,
        created_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
      }
    }),
    count,
    limit,
    offset,
  })
}
