/**
 * Pure helpers for one-click cake order fulfillment.
 * Kept free of request/scope so they can be unit-tested.
 */

export type FulfillableOrderItem = {
  id: string
  quantity?: number | null
  detail?: {
    quantity?: number | null
    fulfilled_quantity?: number | null
  } | null
}

/** Remaining qty still open for fulfillment on a line item. */
export const remainingFulfillQuantity = (
  item: FulfillableOrderItem
): number => {
  const total = Number(item.detail?.quantity ?? item.quantity ?? 0)
  const fulfilled = Number(item.detail?.fulfilled_quantity ?? 0)
  if (!Number.isFinite(total) || !Number.isFinite(fulfilled)) return 0
  return Math.max(0, total - fulfilled)
}

/** Build the items payload for createOrderFulfillmentWorkflow. */
export const buildUnfulfilledItemsPayload = (
  items: FulfillableOrderItem[] | null | undefined
): Array<{ id: string; quantity: number }> =>
  (items ?? [])
    .map((item) => ({
      id: item.id,
      quantity: remainingFulfillQuantity(item),
    }))
    .filter((item) => item.quantity > 0)
