/**
 * Run: npx tsx src/lib/data/delivery-policy.unit.test.ts
 */
import {
  DELIVERY_FREE_OVER_GBP,
  DELIVERY_PER_MILE_GBP,
  DELIVERY_DEFAULT_RADIUS_MI,
  DELIVERY_FREE_MILES,
  DELIVERY_POLICY_COPY,
  buildDeliveryPolicyCopy,
} from "./delivery-policy"

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(DELIVERY_FREE_MILES === 1, "default free miles")
assert(DELIVERY_PER_MILE_GBP === 4.49, "default per mile")
assert(DELIVERY_DEFAULT_RADIUS_MI === 10, "default radius mi")
assert(DELIVERY_FREE_OVER_GBP === 150, "default free-over")

assert(
  DELIVERY_POLICY_COPY ===
    "Within 10 miles. First mile free, then £4.49 per mile. Free delivery on orders of £150 or more within our delivery area.",
  "locked product policy copy"
)

assert(
  buildDeliveryPolicyCopy({ freeOverGbp: 200, radiusMi: 12, perMileGbp: 5 }) ===
    "Within 12 miles. First mile free, then £5 per mile. Free delivery on orders of £200 or more within our delivery area.",
  "policy copy respects overrides"
)

console.log("delivery-policy.unit.test.ts: all assertions passed")
