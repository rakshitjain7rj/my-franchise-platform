"use client";

type StarsProps = {
  rating: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When true, empty stars are muted; filled stars use magenta. */
  showEmpty?: boolean;
};

const sizeClass = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
};

/**
 * Displays a 1–5 star rating. Accepts half-stars via decimal (e.g. 4.2 → 4 full).
 */
export function Stars({
  rating,
  size = "md",
  className = "",
  showEmpty = true,
}: StarsProps) {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span
      className={`inline-flex items-center gap-0.5 leading-none ${sizeClass[size]} ${className}`}
      aria-label={`${rating} out of 5 stars`}
      role="img"
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full;
        return (
          <span
            key={i}
            className={
              filled
                ? "text-vibrant-magenta"
                : showEmpty
                  ? "text-outline-variant"
                  : "sr-only"
            }
            aria-hidden={!filled && !showEmpty}
          >
            ★
          </span>
        );
      })}
    </span>
  );
}

type InteractiveStarsProps = {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
};

/** Clickable star input for the write-review form. */
export function InteractiveStars({
  value,
  onChange,
  disabled,
}: InteractiveStarsProps) {
  return (
    <div className="inline-flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`text-2xl leading-none transition-transform hover:scale-110 disabled:opacity-50 ${
              selected ? "text-vibrant-magenta" : "text-outline-variant"
            }`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
