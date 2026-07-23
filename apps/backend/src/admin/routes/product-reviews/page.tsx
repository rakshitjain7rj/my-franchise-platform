/**
 * Product Reviews — bakery moderation queue.
 *
 * Lists reviews filtered by status (pending / approved / rejected) and lets
 * franchise admins approve or reject. Data: GET/POST /admin/product-reviews.
 */

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, ChatBubbleLeftRight, StarSolid } from "@medusajs/icons"
import { Badge, Button, Container, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { sdk } from "../../lib/sdk"
import {
  CardListSkeleton,
  EmptyState,
  FilterBar,
  FilterPills,
  PageHeader,
  SearchInput,
} from "../../components/ui"

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

const STATUS_OPTIONS: Array<{ value: ReviewStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
]

const Stars = ({ rating }: { rating: number }) => (
  <span
    className="inline-flex items-center gap-0.5 text-ui-tag-orange-icon"
    role="img"
    aria-label={`Rated ${rating} out of 5 stars`}
  >
    {Array.from({ length: 5 }).map((_, i) => (
      <StarSolid
        key={i}
        className={i < rating ? "" : "text-ui-fg-muted opacity-40"}
      />
    ))}
  </span>
)

const ProductReviewsPage = () => {
  const [status, setStatus] = useState<ReviewStatus>("pending")
  const [search, setSearch] = useState("")
  const queryClient = useQueryClient()

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
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

  const reviews = useMemo(() => {
    const all = data?.reviews ?? []
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((review) =>
      [
        review.nickname,
        review.email ?? "",
        review.title ?? "",
        review.content,
        review.product_title ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
  }, [data?.reviews, search])

  const isSearching = search.trim().length > 0

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="divide-y p-0">
        <PageHeader
          title="Product Reviews"
          description="Moderate storefront reviews before they go live."
          actions={
            <>
              <Badge size="2xsmall" color="orange">
                {data?.count ?? 0} {status}
              </Badge>
              <Button
                variant="secondary"
                size="small"
                onClick={() => refetch()}
                isLoading={isFetching}
              >
                <ArrowPath />
                Refresh
              </Button>
            </>
          }
        />

        <FilterBar ariaLabel="Filter reviews">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search reviewer, product, text…"
            ariaLabel="Search reviews"
            className="w-full sm:w-72"
          />
          <FilterPills<ReviewStatus>
            options={STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
            ariaLabel="Filter by review status"
          />
        </FilterBar>
      </Container>

      {isLoading ? (
        <CardListSkeleton cards={3} />
      ) : isError ? (
        <Container className="p-6">
          <EmptyState
            icon={<ChatBubbleLeftRight />}
            title="Could not load reviews"
            description="Check that you are logged in and try again."
            primaryAction={{
              label: "Retry",
              onClick: () => {
                void refetch()
              },
              isLoading: isFetching,
            }}
          />
        </Container>
      ) : reviews.length === 0 ? (
        <Container className="p-6">
          <EmptyState
            icon={<ChatBubbleLeftRight />}
            title={
              isSearching
                ? "No reviews match your search"
                : `No ${status} reviews right now`
            }
            description={
              isSearching
                ? `Nothing found for “${search.trim()}”. Try a different name or product.`
                : status === "pending"
                  ? "New storefront reviews will appear here for moderation."
                  : `Reviews you ${status === "approved" ? "approve" : "reject"} will appear here.`
            }
            secondaryAction={
              isSearching
                ? { label: "Clear search", onClick: () => setSearch("") }
                : undefined
            }
          />
        </Container>
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((review) => (
            <Container key={review.id} className="p-0 divide-y">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars rating={review.rating} />
                    <Text size="small" weight="plus">
                      {review.nickname}
                    </Text>
                    {review.is_verified_purchase && (
                      <Badge size="2xsmall" color="green">
                        Verified purchase
                      </Badge>
                    )}
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {new Date(review.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </div>
                  {review.product_title && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      on {review.product_title}
                    </Text>
                  )}
                  {review.title && (
                    <Text size="small" weight="plus" className="pt-0.5">
                      {review.title}
                    </Text>
                  )}
                  <Text size="small" className="text-ui-fg-subtle whitespace-pre-wrap">
                    {review.content}
                  </Text>
                  {review.email && (
                    <Text size="xsmall" className="text-ui-fg-muted pt-0.5">
                      {review.email}
                    </Text>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  {status !== "approved" && (
                    <Button
                      size="small"
                      variant={status === "pending" ? "primary" : "secondary"}
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
                      variant={status === "pending" ? "danger" : "secondary"}
                      disabled={moderate.isPending}
                      onClick={() =>
                        moderate.mutate({ id: review.id, next: "rejected" })
                      }
                    >
                      Reject
                    </Button>
                  )}
                </div>
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
