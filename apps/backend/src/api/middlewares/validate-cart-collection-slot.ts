/**
 * POST /store/carts/:id/complete — enforce kitchen lead time + bookable slot.
 *
 * Prevents completing a cart whose requested_pickup_* falls inside the
 * store's lead-time window (Kitchen Busy mode) or points at a closed branch.
 */

import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  assertCollectionSlotAllowed,
  collectionRequestFromMetadata,
  type StoreLocationForSlot,
} from "../../utils/validate-collection-slot"
import type { OpeningHours } from "../../utils/logistics"

function cartIdFromPath(req: MedusaRequest): string | null {
  const path = req.path ?? req.url ?? ""
  // /store/carts/:id/complete
  const m = /\/store\/carts\/([^/]+)\/complete/.exec(path)
  if (m?.[1]) return decodeURIComponent(m[1])
  const params = req.params as Record<string, string> | undefined
  return params?.id ?? params?.cart_id ?? null
}

export async function validateCartCollectionSlot(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const cartId = cartIdFromPath(req)
    if (!cartId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Cart id is required to complete checkout."
      )
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: ["id", "metadata"],
      filters: { id: cartId },
    })

    const cart = (carts?.[0] ?? null) as {
      id?: string
      metadata?: Record<string, unknown> | null
    } | null

    if (!cart?.id) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cart "${cartId}" was not found.`
      )
    }

    const meta = cart.metadata ?? {}
    const storeLocationId =
      (typeof meta.store_location_id === "string" && meta.store_location_id) ||
      (typeof req.headers["x-store-location-id"] === "string"
        ? req.headers["x-store-location-id"].trim()
        : "")

    if (!storeLocationId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Select a bakery location before placing your order."
      )
    }

    const franchiseService = req.scope.resolve("franchise") as {
      listStoreLocations: (
        filters?: Record<string, unknown>,
        config?: Record<string, unknown>
      ) => Promise<StoreLocationForSlot[]>
    }

    const [location] = await franchiseService.listStoreLocations(
      { id: storeLocationId },
      {
        select: [
          "id",
          "name",
          "is_active",
          "is_accepting_orders",
          "custom_lead_time_hours",
          "opening_hours",
          "daily_order_capacity",
          "metadata",
        ],
      }
    )

    if (!location) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "The selected bakery was not found."
      )
    }

    assertCollectionSlotAllowed(
      {
        ...location,
        opening_hours: location.opening_hours as OpeningHours | null,
      },
      collectionRequestFromMetadata(meta)
    )

    return next()
  } catch (err) {
    if (err instanceof MedusaError) {
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
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({
      type: "unexpected_state",
      message: `Could not validate collection slot: ${message}`,
    })
  }
}
