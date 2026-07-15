import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import StoreLocationStockLocationLink from "../../../links/store-location-stock-location"

/**
 * POST /store/cart-inventory-check
 *
 * Cross-references the line items in a given cart against the inventory
 * available at the selected StoreLocation's linked Medusa StockLocation.
 *
 * Body:
 * {
 *   cart_id: string,
 *   store_location_id: string
 * }
 *
 * Response:
 * {
 *   all_sufficient: boolean,
 *   items: [
 *     { variant_id, requested_quantity, available_quantity, is_sufficient }
 *   ]
 * }
 *
 * This endpoint runs server-side so we never expose the Medusa admin inventory
 * service directly to the browser. The storefront calls this before rendering
 * the "Proceed to Checkout" button.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = req.body as {
    cart_id?: string
    store_location_id?: string
  }

  if (!body.cart_id || !body.store_location_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Both 'cart_id' and 'store_location_id' are required."
    )
  }

  const { cart_id, store_location_id } = body

  // ── 1. Resolve StoreLocation to check if it exists ───────────────────
  const franchiseService = req.scope.resolve("franchise") as any
  const query = req.scope.resolve("query") as {
    graph: (opts: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: Array<Record<string, any>> }>
  }

  const [storeLocation] = await franchiseService.listStoreLocations(
    { id: store_location_id },
    { select: ["id"] }
  )

  if (!storeLocation) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `StoreLocation ${store_location_id} not found.`
    )
  }

  const { data: links } = await query.graph({
    entity: StoreLocationStockLocationLink.entryPoint,
    fields: ["stock_location_id"],
    filters: { store_location_id: store_location_id },
  })

  const stockLocationId = (links?.[0]?.stock_location_id as string | undefined) || null

  // ── 2. Fetch cart line items ──────────────────────────────────────────────
  const cartService = req.scope.resolve(Modules.CART) as {
    retrieveCart: (
      cartId: string,
      config?: Record<string, unknown>
    ) => Promise<{
      items: Array<{
        id: string
        variant_id: string | null
        quantity: number
      }>
    }>
  }

  const cart = await cartService.retrieveCart(cart_id, {
    relations: ["items"],
  })

  if (!cart.items?.length) {
    return res.json({ all_sufficient: true, items: [] })
  }

  // ── 3. Check inventory levels per variant ────────────────────────────────
  const inventoryService = req.scope.resolve(Modules.INVENTORY) as {
    listInventoryLevels: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        variant_id?: string
        inventory_item_id: string
        location_id: string
        stocked_quantity: number
        reserved_quantity: number
      }>
    >
    listInventoryItems: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ id: string; variants?: Array<{ id: string }> }>>
  }

  const variantIds = cart.items
    .map((i) => i.variant_id)
    .filter((v): v is string => Boolean(v))

  // FAIL CLOSED: a StoreLocation with no linked StockLocation cannot have its
  // inventory verified. Previously this path assumed everything was in stock,
  // which silently let a misconfigured branch oversell. We now block checkout
  // and surface a clear reason so the misconfiguration is caught rather than
  // hidden. (Consistent with the platform's fail-closed scope-resolution
  // policy — see commit 16e27fb.)
  if (!stockLocationId) {
    const items = cart.items.map((item) => ({
      variant_id: item.variant_id,
      requested_quantity: item.quantity,
      available_quantity: 0,
      is_sufficient: false,
    }))
    return res.json({
      all_sufficient: false,
      reason: "STORE_HAS_NO_STOCK_LOCATION",
      message:
        "This store's inventory is not configured yet, so orders cannot be " +
        "accepted right now. Please choose another location or try again later.",
      items,
    })
  }

  // Map variant_id → inventory levels at the linked stock location
  type InventoryResult = {
    variant_id: string | null
    requested_quantity: number
    available_quantity: number
    is_sufficient: boolean
  }

  const result: InventoryResult[] = []

  for (const item of cart.items) {
    if (!item.variant_id) {
      result.push({
        variant_id: null,
        requested_quantity: item.quantity,
        available_quantity: 0,
        is_sufficient: false,
      })
      continue
    }
    try {
      // Medusa v2: inventory items are linked to variants via the link module

      const { data: variantLinks } = await query.graph({
        entity: "product_variant_inventory_item",
        fields: ["inventory_item_id"],
        filters: { variant_id: item.variant_id },
      })

      if (!variantLinks.length) {
        // No inventory item linked — treat as always-available (e.g. digital products)
        result.push({
          variant_id: item.variant_id,
          requested_quantity: item.quantity,
          available_quantity: 999,
          is_sufficient: true,
        })
        continue
      }

      const inventoryItemId = variantLinks[0].inventory_item_id as string

      const levels = await inventoryService.listInventoryLevels({
        inventory_item_id: inventoryItemId,
        location_id: stockLocationId,
      })

      const level = levels[0]
      const available = level
        ? (level.stocked_quantity ?? 0) - (level.reserved_quantity ?? 0)
        : 0

      result.push({
        variant_id: item.variant_id,
        requested_quantity: item.quantity,
        available_quantity: available,
        is_sufficient: available >= item.quantity,
      })
    } catch {
      // FAIL CLOSED: if the inventory lookup errors we must not assume stock is
      // available (that would risk overselling). Mark the item insufficient so
      // checkout is blocked rather than silently allowed on a transient fault.
      result.push({
        variant_id: item.variant_id,
        requested_quantity: item.quantity,
        available_quantity: 0,
        is_sufficient: false,
      })
    }
  }

  const allSufficient = result.every((r) => r.is_sufficient)

  res.json({
    all_sufficient: allSufficient,
    items: result,
  })
}
