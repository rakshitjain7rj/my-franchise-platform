/**
 * Product Reviews — bakery moderation queue.
 *
 * Lists reviews filtered by status (pending / approved / rejected) and lets
 * franchise admins approve or reject. Data: GET/POST /admin/product-reviews.
 */

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight, ArrowPath } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Text, Toaster, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"

type ReviewStatus = "pending" | "approved" | "rejected"

type AdminReview = {
  id: string
  rating: number
  title: string | null
  content: string
  nickname: string
  email: string | null
  status: ReviewStatus
  is_verified_purchase: boolean
  product_id: string | null
  product_title: string | null
  created_at: string
}

type ReviewsResponse = {
  reviews: AdminReview[]
  count: number
  limit: number
  offset: number
}

const STATUS_TABS: Array<{ key: ReviewStatus | "all"; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
]

const Stars = ({ rating }: { rating: number }) => (
  <span className="text-ui-fg-interactive tracking-tight" aria-label={`${rating} of 5 stars`}>
    {"★".repeat(rating)}
    <span className="text-ui-fg-muted">{"★".repeat(5 - rating)}</span>
  </span>
)

const ProductReviewsPage = () => {
  const [status, setStatus] = useState<ReviewStatus>("pending")
  const queryClient = useQueryClient()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-product-reviews", status],
    queryFn: () =>
      sdk.client.fetch<ReviewsResponse>("/admin/product-reviews", {
        query: { status, limit: 100 },
      }),
  })

  const moderate = useMutation({
    mutationFn: async ({
      id,
      next,
    }: {
      id: string
      next: "approved" | "rejected"
    }) =>
      sdk.client.fetch(`/admin/product-reviews/${id}`, {
        method: "POST",
        body: { status: next },
      }),
    onSuccess: (_data, vars) => {
      toast.success(
        vars.next === "approved" ? "Review approved" : "Review rejected"
      )
      queryClient.invalidateQueries({ queryKey: ["admin-product-reviews"] })
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update review")
    },
  })

  const reviews = data?.reviews ?? []

  return (
    <div className="flex flex-col gap-y-4">
      <Toaster />
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <Heading level="h1">Product Reviews</Heading>
            <Badge size="2xsmall" color="orange">
              {data?.count ?? 0} {status}
            </Badge>
          </div>
          <Button
            variant="secondary"
            size="small"
            onClick={() => refetch()}
            isLoading={isFetching}
          >
            <ArrowPath />
            Refresh
          </Button>
        </div>

        <div className="flex gap-2 px-6 py-3">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.key}
              size="small"
              variant={status === tab.key ? "primary" : "secondary"}
              onClick={() => setStatus(tab.key as ReviewStatus)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </Container>

      {isLoading ? (
        <Container className="p-6">
          <Text className="text-ui-fg-muted">Loading reviews…</Text>
        </Container>
      ) : reviews.length === 0 ? (
        <Container className="p-8 text-center">
          <Text className="text-ui-fg-muted">
            No {status} reviews right now.
          </Text>
        </Container>
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((review) => (
            <Container key={review.id} className="p-0 divide-y">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars rating={review.rating} />
                    <Text size="small" weight="plus">
                      {review.nickname}
                    </Text>
                    {review.is_verified_purchase && (
                      <Badge size="2xsmall" color="green">
                        Verified
                      </Badge>
                    )}
                    <Badge size="2xsmall" color="grey">
                      {new Date(review.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Badge>
                  </div>
                  {review.product_title && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      on {review.product_title}
                    </Text>
                  )}
                  {review.title && (
                    <Text size="small" weight="plus" className="pt-1">
                      {review.title}
                    </Text>
                  )}
                  <Text size="small" className="text-ui-fg-subtle whitespace-pre-wrap">
                    {review.content}
                  </Text>
                  {review.email && (
                    <Text size="xsmall" className="text-ui-fg-muted pt-1">
                      {review.email}
                    </Text>
                  )}
                </div>

                {status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="small"
                      variant="primary"
                      disabled={moderate.isPending}
                      onClick={() =>
                        moderate.mutate({ id: review.id, next: "approved" })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="small"
                      variant="danger"
                      disabled={moderate.isPending}
                      onClick={() =>
                        moderate.mutate({ id: review.id, next: "rejected" })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                )}

                {status !== "pending" && (
                  <div className="flex gap-2 shrink-0">
                    {status !== "approved" && (
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={moderate.isPending}
                        onClick={() =>
                          moderate.mutate({ id: review.id, next: "approved" })
                        }
                      >
                        Approve
                      </Button>
                    )}
                    {status !== "rejected" && (
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={moderate.isPending}
                        onClick={() =>
                          moderate.mutate({ id: review.id, next: "rejected" })
                        }
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Container>
          ))}
        </div>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Product Reviews",
  icon: ChatBubbleLeftRight,
})

export default ProductReviewsPage
