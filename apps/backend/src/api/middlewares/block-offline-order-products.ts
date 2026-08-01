/**
 * Hard gate: wedding/icing cakes cannot be added to cart or checked out online.
 *
 * - POST /store/carts/:id/line-items — reject offline variants
 * - POST /store/carts/:id/complete — reject carts that still contain offline lines
 */

import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  OFFLINE_ORDER_API_MESSAGE,
  productHasOfflineOrderCategory,
} from "../../utils/offline-order-categories"

type CategoryRow = { handle?: string | null }

function cartIdFromPath(req: MedusaRequest, kind: "line-items" | "complete"): string | null {
  const path = req.path ?? req.url ?? ""
  const re =
    kind === "complete"
      ? /\/store\/carts\/([^/]+)\/complete/
      : /\/store\/carts\/([^/]+)\/line-items/
  const m = re.exec(path)
  if (m?.[1]) return decodeURIComponent(m[1])
  const params = req.params as Record<string, string> | undefined
  return params?.id ?? params?.cart_id ?? null
}

function respondMedusaError(res: MedusaResponse, err: MedusaError) {
  const status =
    err.type === MedusaError.Types.NOT_FOUND
      ? 404
      : err.type === MedusaError.Types.NOT_ALLOWED
        ? 403
        : 400
  return res.status(status).json({
    type: err.type,
    message: err.message,
  })
}

/**
 * Resolve product categories for a store variant id.
 */
async function categoriesForVariantId(
  query: {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  },
  variantId: string
): Promise<CategoryRow[]> {
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "product.id",
      "product.categories.id",
      "product.categories.handle",
      "product.categories.name",
    ],
    filters: { id: variantId },
  })

  const row = (variants?.[0] ?? null) as {
    product?: {
      categories?: CategoryRow[] | null
    } | null
  } | null

  return row?.product?.categories ?? []
}

/**
 * POST /store/carts/:id/line-items — block offline products at add time.
 */
export async function blockOfflineOrderLineItem(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const body = (req.body ?? {}) as { variant_id?: string }
    const variantId =
      typeof body.variant_id === "string" ? body.variant_id.trim() : ""

    if (!variantId) {
      // Let Medusa's own validator handle missing variant_id.
      return next()
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as {
      graph: (args: {
        entity: string
        fields: string[]
        filters?: Record<string, unknown>
      }) => Promise<{ data: unknown[] }>
    }

    const categories = await categoriesForVariantId(query, variantId)
    if (productHasOfflineOrderCategory(categories)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        OFFLINE_ORDER_API_MESSAGE
      )
    }

    return next()
  } catch (err) {
    if (err instanceof MedusaError) {
      return respondMedusaError(res, err)
    }
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({
      type: "unexpected_state",
      message: `Could not validate cart line item: ${message}`,
    })
  }
}

/**
 * POST /store/carts/:id/complete — refuse checkout if any line is offline.
 */
export async function blockOfflineOrderComplete(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const cartId = cartIdFromPath(req, "complete")
    if (!cartId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Cart id is required to complete checkout."
      )
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as {
      graph: (args: {
        entity: string
        fields: string[]
        filters?: Record<string, unknown>
      }) => Promise<{ data: unknown[] }>
    }

    const { data: carts } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "items.id",
        "items.variant_id",
        "items.product_id",
        "items.product.categories.id",
        "items.product.categories.handle",
        "items.product.categories.name",
      ],
      filters: { id: cartId },
    })

    const cart = (carts?.[0] ?? null) as {
      id?: string
      items?: Array<{
        id?: string
        product?: { categories?: CategoryRow[] | null } | null
      }> | null
    } | null

    if (!cart?.id) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cart "${cartId}" was not found.`
      )
    }

    for (const item of cart.items ?? []) {
      if (productHasOfflineOrderCategory(item.product?.categories)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          OFFLINE_ORDER_API_MESSAGE
        )
      }
    }

    return next()
  } catch (err) {
    if (err instanceof MedusaError) {
      return respondMedusaError(res, err)
    }
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({
      type: "unexpected_state",
      message: `Could not validate cart for offline products: ${message}`,
    })
  }
}
