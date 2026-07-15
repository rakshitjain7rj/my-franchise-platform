/**
 * Storefront helpers for product reviews (store API).
 */

import { getMedusaHeadersSync } from "@/lib/medusa/headers"

const BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ??
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ??
  "http://localhost:9000"

export type PublicReview = {
  id: string
  rating: number
  title: string | null
  content: string
  nickname: string
  is_verified_purchase: boolean
  created_at: string
}

export type ReviewsSummary = {
  reviews: PublicReview[]
  count: number
  average_rating: number | null
  rating_breakdown: Record<1 | 2 | 3 | 4 | 5, number>
  limit?: number
  offset?: number
}

export type SubmitReviewInput = {
  rating: number
  nickname: string
  content: string
  title?: string
  email?: string
}

export async function fetchProductReviews(
  productId: string,
  options?: { limit?: number; offset?: number }
): Promise<ReviewsSummary> {
  const params = new URLSearchParams()
  if (options?.limit) params.set("limit", String(options.limit))
  if (options?.offset) params.set("offset", String(options.offset))

  const qs = params.toString()
  const headers = getMedusaHeadersSync()

  const res = await fetch(
    `${BACKEND_URL}/store/products/${encodeURIComponent(productId)}/reviews${
      qs ? `?${qs}` : ""
    }`,
    { headers, cache: "no-store" }
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { message?: string }).message ??
        `Failed to load reviews (${res.status})`
    )
  }

  return res.json() as Promise<ReviewsSummary>
}

export async function submitProductReview(
  productId: string,
  input: SubmitReviewInput
): Promise<{ id: string; message: string }> {
  const headers = getMedusaHeadersSync()

  const res = await fetch(
    `${BACKEND_URL}/store/products/${encodeURIComponent(productId)}/reviews`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      cache: "no-store",
    }
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { message?: string }).message ??
        `Could not submit review (${res.status})`
    )
  }

  const json = (await res.json()) as {
    review?: { id?: string; message?: string }
  }

  return {
    id: json.review?.id ?? "",
    message:
      json.review?.message ??
      "Thank you! Your review has been submitted for approval.",
  }
}
