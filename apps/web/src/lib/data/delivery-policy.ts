/**
 * Customer-facing delivery policy constants (cart + checkout).
 *
 * Keep in sync with backend `DEFAULT_DELIVERY_FEE_CONFIG` / env:
 *   DELIVERY_FREE_MILES, DELIVERY_PER_MILE, DELIVERY_DEFAULT_RADIUS_MI,
 *   DELIVERY_FREE_OVER_GBP
 *
 * Storefront reads NEXT_PUBLIC_* so values are available in the browser.
 * Charge path still uses backend env only — these drive copy + free-over progress.
 */

function envNumber(name: string, fallback: number): number {
  const raw =
    typeof process !== "undefined" ? process.env[name] : undefined
  if (raw == null || raw === "") return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/** First N miles free (default 1). */
export const DELIVERY_FREE_MILES = envNumber(
  "NEXT_PUBLIC_DELIVERY_FREE_MILES",
  1
)

/** GBP per mile after free band (default 4.49). */
export const DELIVERY_PER_MILE_GBP = envNumber(
  "NEXT_PUBLIC_DELIVERY_PER_MILE",
  4.49
)

/** Max deliverable radius in miles (default 10). */
export const DELIVERY_DEFAULT_RADIUS_MI = envNumber(
  "NEXT_PUBLIC_DELIVERY_DEFAULT_RADIUS_MI",
  10
)

/** Free delivery when merchandise ≥ this (GBP major units, default 150). */
export const DELIVERY_FREE_OVER_GBP = envNumber(
  "NEXT_PUBLIC_DELIVERY_FREE_OVER_GBP",
  150
)

function formatGbp(amount: number): string {
  // Match locked product copy: £4.49 / £150 (drop trailing zeros only when whole pounds)
  if (Number.isInteger(amount)) return `£${amount}`
  return `£${amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`
}

/**
 * Locked product policy strip for cart + checkout.
 * Example default:
 * "Within 10 miles. First mile free, then £4.49 per mile. Free delivery on orders of £150 or more within our delivery area."
 */
export function buildDeliveryPolicyCopy(opts?: {
  freeMiles?: number
  perMileGbp?: number
  radiusMi?: number
  freeOverGbp?: number
}): string {
  const freeMiles = opts?.freeMiles ?? DELIVERY_FREE_MILES
  const perMile = opts?.perMileGbp ?? DELIVERY_PER_MILE_GBP
  const radius = opts?.radiusMi ?? DELIVERY_DEFAULT_RADIUS_MI
  const freeOver = opts?.freeOverGbp ?? DELIVERY_FREE_OVER_GBP

  const firstBand =
    freeMiles === 1
      ? "First mile free"
      : `First ${freeMiles} miles free`

  return (
    `Within ${radius} miles. ${firstBand}, then ${formatGbp(perMile)} per mile. ` +
    `Free delivery on orders of ${formatGbp(freeOver)} or more within our delivery area.`
  )
}

/** Customer-facing delivery policy (cart + checkout). */
export const DELIVERY_POLICY_COPY = buildDeliveryPolicyCopy()
