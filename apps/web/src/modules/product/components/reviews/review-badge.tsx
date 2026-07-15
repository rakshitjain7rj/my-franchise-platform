"use client";

import { Stars } from "./stars";

type ReviewBadgeProps = {
  averageRating: number | null;
  count: number;
  onClick?: () => void;
};

/**
 * Compact average rating chip shown under the product title.
 * e.g. ★★★★☆ 4.2 (12 reviews)
 */
export default function ReviewBadge({
  averageRating,
  count,
  onClick,
}: ReviewBadgeProps) {
  if (count === 0 || averageRating == null) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-deep-plum transition-colors"
      >
        <Stars rating={0} size="sm" />
        <span className="underline-offset-2 hover:underline">
          Be the first to review
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm text-deep-plum hover:text-vibrant-magenta transition-colors group"
    >
      <Stars rating={averageRating} size="sm" />
      <span className="font-label-bold tabular-nums">
        {averageRating.toFixed(1)}
      </span>
      <span className="text-on-surface-variant group-hover:underline underline-offset-2">
        ({count} {count === 1 ? "review" : "reviews"})
      </span>
    </button>
  );
}
