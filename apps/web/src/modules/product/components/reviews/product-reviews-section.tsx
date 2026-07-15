"use client";

/**
 * Owns a single reviews fetch and renders:
 *  - optional title-area badge (via render prop / portal slot)
 *  - full reviews section with form modal
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchProductReviews,
  type PublicReview,
  type ReviewsSummary,
} from "@/lib/data/reviews";
import { Stars } from "./stars";
import ReviewBadge from "./review-badge";
import ReviewFormModal from "./review-form-modal";

type ProductReviewsSectionProps = {
  productId: string;
  productTitle: string;
  /** Receives the title badge node so the parent can place it under the H1. */
  onBadgeReady?: (badge: React.ReactNode) => void;
};

function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ProductReviewsSection({
  productId,
  productTitle,
  onBadgeReady,
}: ProductReviewsSectionProps) {
  const [summary, setSummary] = useState<ReviewsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchProductReviews(productId, { limit: 20 });
      setSummary(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load reviews."
      );
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const count = summary?.count ?? 0;
  const average = summary?.average_rating ?? null;
  const reviews: PublicReview[] = summary?.reviews ?? [];

  const scrollToReviews = useCallback(() => {
    document
      .getElementById("product-reviews")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Publish title badge to parent
  useEffect(() => {
    if (!onBadgeReady) return;
    if (isLoading) {
      onBadgeReady(
        <span className="inline-block h-5 w-32 bg-deep-plum/10 rounded animate-pulse" />
      );
      return;
    }
    onBadgeReady(
      <ReviewBadge
        averageRating={average}
        count={count}
        onClick={scrollToReviews}
      />
    );
  }, [onBadgeReady, isLoading, average, count, scrollToReviews]);

  return (
    <section
      id="product-reviews"
      className="space-y-8 pt-10 border-t border-outline-variant/20 scroll-mt-24"
      aria-labelledby="reviews-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-2">
          <h2
            id="reviews-heading"
            className="font-headline-md text-2xl md:text-3xl text-deep-plum"
          >
            Customer Reviews
          </h2>
          {!isLoading && (
            <ReviewBadge
              averageRating={average}
              count={count}
              onClick={() => setFormOpen(true)}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-md bg-deep-plum text-white text-xs font-label-bold uppercase tracking-widest hover:bg-vibrant-magenta transition-colors shrink-0"
        >
          <span className="material-symbols-outlined !text-[18px]">
            rate_review
          </span>
          Write a Review
        </button>
      </div>

      {count > 0 && summary?.rating_breakdown && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-[#FBF5FB] rounded-3xl border border-outline-variant/20 p-6">
          <div className="flex flex-col items-start justify-center gap-1">
            <span className="text-5xl font-headline-lg text-deep-plum tabular-nums">
              {average?.toFixed(1)}
            </span>
            <Stars rating={average ?? 0} size="lg" />
            <p className="text-sm text-on-surface-variant mt-1">
              Based on {count} {count === 1 ? "review" : "reviews"}
            </p>
          </div>
          <div className="space-y-1.5">
            {([5, 4, 3, 2, 1] as const).map((star) => {
              const n = summary.rating_breakdown[star] ?? 0;
              const pct = count > 0 ? Math.round((n / count) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-8 text-on-surface-variant tabular-nums">
                    {star}★
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-white overflow-hidden border border-outline-variant/20">
                    <div
                      className="h-full bg-vibrant-magenta/80 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-on-surface-variant tabular-nums">
                    {n}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-4 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-deep-plum/5 border border-outline-variant/10"
            />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {!isLoading && !error && reviews.length === 0 && (
        <div className="rounded-3xl border border-dashed border-outline-variant/40 bg-lavender-bg/30 px-6 py-10 text-center space-y-3">
          <p className="font-headline-md text-lg text-deep-plum">
            No reviews yet
          </p>
          <p className="text-sm text-on-surface-variant max-w-md mx-auto">
            Tried this cake? Share your experience — reviews appear after a
            quick check by the bakery team.
          </p>
        </div>
      )}

      {!isLoading && reviews.length > 0 && (
        <ul className="space-y-4">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="rounded-2xl border border-outline-variant/20 bg-white p-5 shadow-sm space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Stars rating={review.rating} size="sm" />
                <span className="font-label-bold text-sm text-deep-plum">
                  {review.nickname}
                </span>
                {review.is_verified_purchase && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                    Verified purchase
                  </span>
                )}
                <span className="text-xs text-on-surface-variant ml-auto">
                  {formatReviewDate(review.created_at)}
                </span>
              </div>
              {review.title && (
                <p className="font-label-bold text-deep-plum text-sm">
                  {review.title}
                </p>
              )}
              <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                {review.content}
              </p>
            </li>
          ))}
        </ul>
      )}

      <ReviewFormModal
        productId={productId}
        productTitle={productTitle}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmitted={load}
      />
    </section>
  );
}
