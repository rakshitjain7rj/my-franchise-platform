/**
 * Pure inventory availability helpers.
 *
 * Mirrors the rules used by:
 *   - POST /store/cart-inventory-check
 *   - Storefront isProductAvailable / add-to-cart gates
 *
 * Kept free of Medusa services so unit tests can pin out-of-stock and
 * cart-sufficiency behaviour without a database.
 */

/** Units free to sell at a stock location. Never negative. */
export function computeAvailableQuantity(
  stockedQuantity: number,
  reservedQuantity: number = 0
): number {
  const stocked = Number(stockedQuantity)
  const reserved = Number(reservedQuantity)
  const s = Number.isFinite(stocked) ? stocked : 0
  const r = Number.isFinite(reserved) ? reserved : 0
  return Math.max(0, s - r)
}

/** True when requested qty can be fulfilled from available stock. */
export function isInventorySufficient(
  availableQuantity: number,
  requestedQuantity: number
): boolean {
  const available = Number(availableQuantity)
  const requested = Number(requestedQuantity)
  if (!Number.isFinite(requested) || requested <= 0) return true
  if (!Number.isFinite(available)) return false
  return available >= requested
}

/**
 * SKU is sellable when inventory is managed and available > 0,
 * OR inventory is not managed, OR backorders are allowed.
 * Matches storefront isProductAvailable variant rules.
 */
export function isSkuInStock(input: {
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
  inventory_quantity?: number | null
}): boolean {
  if (input.manage_inventory === false) return true
  if (input.allow_backorder) return true
  const qty = Number(input.inventory_quantity)
  return Number.isFinite(qty) && qty > 0
}

export type CartInventoryLineInput = {
  variant_id: string | null
  requested_quantity: number
  /**
   * null = no inventory item linked (treat as always-available, e.g. digital).
   * undefined should not be used; prefer explicit null or a number.
   */
  available_quantity: number | null
}

export type CartInventoryLineResult = {
  variant_id: string | null
  requested_quantity: number
  available_quantity: number
  is_sufficient: boolean
}

/**
 * Evaluate cart lines the same way cart-inventory-check does for known stock
 * levels. `available_quantity: null` means "no inventory item" → always OK.
 */
export function evaluateCartInventory(
  lines: CartInventoryLineInput[]
): {
  all_sufficient: boolean
  items: CartInventoryLineResult[]
} {
  const items: CartInventoryLineResult[] = lines.map((line) => {
    if (!line.variant_id) {
      return {
        variant_id: null,
        requested_quantity: line.requested_quantity,
        available_quantity: 0,
        is_sufficient: false,
      }
    }

    // No inventory item linked — platform treats as always-available
    if (line.available_quantity === null) {
      return {
        variant_id: line.variant_id,
        requested_quantity: line.requested_quantity,
        available_quantity: 999,
        is_sufficient: true,
      }
    }

    const available = Math.max(0, Number(line.available_quantity) || 0)
    return {
      variant_id: line.variant_id,
      requested_quantity: line.requested_quantity,
      available_quantity: available,
      is_sufficient: isInventorySufficient(available, line.requested_quantity),
    }
  })

  return {
    all_sufficient: items.every((i) => i.is_sufficient),
    items,
  }
}

/**
 * Product-level availability: sellable if ANY variant is in stock.
 * Matches apps/web isProductAvailable.
 */
export function isProductAvailableFromVariants(
  variants: Array<{
    manage_inventory?: boolean | null
    allow_backorder?: boolean | null
    inventory_quantity?: number | null
  }>
): boolean {
  if (!variants.length) return false
  return variants.some((v) => isSkuInStock(v))
}
