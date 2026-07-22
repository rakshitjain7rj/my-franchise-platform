"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useCart, type InventoryCheckResult } from "@/lib/cart/cart-context"
import {
  applyPromoCode,
  removePromoCode,
  updateCartMetadata,
} from "@/lib/cart/cart-actions"
import { getCustomerAddresses } from "@/lib/auth/account-actions"
import { getMedusaHeadersSync } from "@/lib/medusa/headers"
import { fetchDeliveryFee } from "@/lib/data/logistics"
import { useSelectedStore } from "@/lib/store-selection"
import {
  cartItemsHaveCollectionSlots,
  collectionSlotToCartMetadata,
  getMostRecentLineCollectionSlot,
} from "@/types/cake-metadata"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"

export function useCartPage(franchiseId: string, initialLocationId: string | null) {
  const {
    cart,
    isLoading,
    removeFromCart,
    updateQuantity,
    cartId,
    refreshCart,
    checkInventory,
  } = useCart()

  const {
    storeLocationId: cookieLocationId,
    storeName: cookieStoreName,
  } = useSelectedStore()

  const [locationId, setLocationId] = useState(
    initialLocationId ?? cookieLocationId
  )
  const [locationName, setLocationName] = useState<string | null>(
    cookieStoreName
  )
  const [locationAddress, setLocationAddress] = useState<string | null>(null)
  const [locationWarning, setLocationWarning] = useState<string | null>(null)

  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(
    "pickup"
  )

  const [deliveryPostcode, setDeliveryPostcode] = useState("")
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false)
  const [deliveryFeeError, setDeliveryFeeError] = useState<string | null>(null)
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(
    null
  )

  const [discountCode, setDiscountCode] = useState("")
  const [discountLoading, setDiscountLoading] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [discountSuccess, setDiscountSuccess] = useState<string | null>(null)

  const [inventoryResult, setInventoryResult] =
    useState<InventoryCheckResult | null>(null)
  const [adjustingCart, setAdjustingCart] = useState(false)

  const [hasHydratedMetadata, setHasHydratedMetadata] = useState(false)

  // Keep local location in sync with store-selection protocol (replaces 2s poll).
  const prevCookieLoc = useRef(cookieLocationId)
  useEffect(() => {
    if (!cookieLocationId) {
      prevCookieLoc.current = cookieLocationId
      return
    }
    // Same ID: still apply name-only updates (hydrate / re-broadcast).
    if (cookieLocationId === locationId) {
      if (cookieStoreName) setLocationName(cookieStoreName)
      prevCookieLoc.current = cookieLocationId
      return
    }
    // Only warn when the cookie actually changed after mount (external select).
    if (prevCookieLoc.current && prevCookieLoc.current !== cookieLocationId) {
      setLocationWarning("Bakery location changed. Please review your cart.")
      void persistCartMetadataRef.current?.({
        store_location_id: cookieLocationId,
      })
    }
    setLocationId(cookieLocationId)
    if (cookieStoreName) setLocationName(cookieStoreName)
    prevCookieLoc.current = cookieLocationId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookieLocationId, cookieStoreName])

  const itemsSignature =
    cart?.items?.map((i) => `${i.id}-${i.quantity}`).join(",") ?? ""

  useEffect(() => {
    if (!cartId || !locationId || !cart?.items?.length) {
      setInventoryResult(null)
      return
    }

    let active = true
    checkInventory(locationId)
      .then((res) => {
        if (active && res) {
          setInventoryResult(res)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [cartId, locationId, itemsSignature, checkInventory, cart?.items?.length])

  const handleAdjustToAvailability = useCallback(async () => {
    if (!cart || !inventoryResult) return
    setAdjustingCart(true)
    try {
      for (const inv of inventoryResult.items) {
        if (inv.is_sufficient) continue
        const item = cart.items.find((ci) => ci.variant_id === inv.variant_id)
        if (!item) continue
        if (inv.available_quantity > 0) {
          await updateQuantity(item.id, inv.available_quantity)
        } else {
          await removeFromCart(item.id)
        }
      }
    } catch {
      // Individual failures surface through the cart context's error state.
    } finally {
      setAdjustingCart(false)
    }
  }, [cart, inventoryResult, updateQuantity, removeFromCart])

  const persistCartMetadata = useCallback(
    async (updates: {
      fulfillment_method?: "pickup" | "delivery"
      store_location_id?: string | null
      requested_pickup_date?: string
      requested_pickup_time?: string
      requested_pickup_label?: string
      requested_pickup_iso?: string
      delivery_fee?: number
      delivery_postcode?: string
      delivery_distance_km?: number
      delivery_deliverable?: boolean
    }) => {
      if (!cartId) return

      const currentMeta = cart?.metadata as Record<string, unknown> | null
      const mergedMetadata: Record<string, unknown> = {
        ...currentMeta,
        fulfillment_method: updates.fulfillment_method ?? fulfillment,
        store_location_id:
          updates.store_location_id !== undefined
            ? updates.store_location_id
            : locationId,
        franchise_id: currentMeta?.franchise_id ?? franchiseId,
      }

      // Date/time come from product-page line attributes (promoted once).
      // Do not invent cart-level defaults here.
      if (updates.requested_pickup_date !== undefined) {
        mergedMetadata.requested_pickup_date = updates.requested_pickup_date
      }
      if (updates.requested_pickup_time !== undefined) {
        mergedMetadata.requested_pickup_time = updates.requested_pickup_time
      }
      if (updates.requested_pickup_label !== undefined) {
        mergedMetadata.requested_pickup_label = updates.requested_pickup_label
      }
      if (updates.requested_pickup_iso !== undefined) {
        mergedMetadata.requested_pickup_iso = updates.requested_pickup_iso
      }
      if (updates.delivery_fee !== undefined) {
        mergedMetadata.delivery_fee = updates.delivery_fee
      }
      if (updates.delivery_postcode !== undefined) {
        mergedMetadata.delivery_postcode = updates.delivery_postcode
      }
      if (updates.delivery_distance_km !== undefined) {
        mergedMetadata.delivery_distance_km = updates.delivery_distance_km
      }
      if (updates.delivery_deliverable !== undefined) {
        mergedMetadata.delivery_deliverable = updates.delivery_deliverable
      }

      await updateCartMetadata(cartId, mergedMetadata).catch(() => {})
    },
    [cartId, cart, fulfillment, locationId, franchiseId]
  )

  const persistCartMetadataRef = useRef(persistCartMetadata)
  persistCartMetadataRef.current = persistCartMetadata

  // Hydrate from cart metadata once per cart load
  useEffect(() => {
    if (!cart) {
      setHasHydratedMetadata(false)
      return
    }
    if (hasHydratedMetadata) return

    const meta = cart.metadata as Record<string, unknown> | null

    // Prefer the most recent line item's product-page collection window so
    // checkout can still read cart.metadata.requested_pickup_* if needed.
    const lineSlot = getMostRecentLineCollectionSlot(cart.items)
    const pickupDate =
      (typeof meta?.requested_pickup_date === "string" &&
        meta.requested_pickup_date) ||
      lineSlot?.date ||
      undefined
    const pickupTime =
      (typeof meta?.requested_pickup_time === "string" &&
        meta.requested_pickup_time) ||
      lineSlot?.time ||
      undefined
    const pickupLabel =
      (typeof meta?.requested_pickup_label === "string" &&
        meta.requested_pickup_label) ||
      (pickupTime && !/^\d{2}:\d{2}$/.test(pickupTime) ? pickupTime : "") ||
      ""

    if (meta?.fulfillment_method) {
      setFulfillment(meta.fulfillment_method as "pickup" | "delivery")
    }
    if (typeof meta?.delivery_fee === "number") {
      setDeliveryFee(meta.delivery_fee)
    }
    if (typeof meta?.delivery_postcode === "string") {
      setDeliveryPostcode(meta.delivery_postcode)
    } else {
      void getCustomerAddresses()
        .then((addresses) => {
          const saved =
            addresses.find((a) => a.is_default_shipping) ??
            addresses.find((a) => a.is_default_billing) ??
            addresses[0]
          const pc = saved?.postal_code?.trim()
          if (pc) setDeliveryPostcode((cur) => cur.trim() || pc)
        })
        .catch(() => {})
    }

    // Promote product-page slot → cart metadata once (no cart UI to re-edit).
    // Always overwrite when the line slot disagrees with cart metadata so a
    // stale default (e.g. 17:00) cannot shadow the real collection window.
    if (lineSlot?.date && lineSlot?.time) {
      const promoted = collectionSlotToCartMetadata(lineSlot)
      const cartTime =
        typeof meta?.requested_pickup_time === "string"
          ? meta.requested_pickup_time
          : ""
      const cartLabel =
        typeof meta?.requested_pickup_label === "string"
          ? meta.requested_pickup_label
          : ""
      const cartDate =
        typeof meta?.requested_pickup_date === "string"
          ? meta.requested_pickup_date
          : ""
      const outOfSync =
        cartDate !== promoted.requested_pickup_date ||
        cartTime !== promoted.requested_pickup_time ||
        (promoted.requested_pickup_label &&
          cartLabel !== promoted.requested_pickup_label)
      if (outOfSync) {
        void persistCartMetadata(promoted)
      }
    }

    const cartStore = meta?.store_location_id as string | undefined
    if (locationId && cartStore !== locationId) {
      if (cartStore) {
        setLocationWarning(
          "Your selected bakery has changed since these treats were added. " +
            "We've moved your cart to the new bakery — please review each item's availability below."
        )
      }
      void persistCartMetadata({
        store_location_id: locationId,
        fulfillment_method:
          (meta?.fulfillment_method as "pickup" | "delivery") ?? "pickup",
        ...(pickupDate ? { requested_pickup_date: pickupDate } : {}),
        ...(pickupTime
          ? {
              requested_pickup_time: pickupTime,
              requested_pickup_label: pickupLabel || pickupTime,
            }
          : {}),
      })
    }

    setHasHydratedMetadata(true)
  }, [cart, hasHydratedMetadata, locationId, persistCartMetadata])

  // Load location name/address
  useEffect(() => {
    if (!franchiseId) return
    fetch(`${BACKEND_URL}/store/franchises/${franchiseId}/locations`, {
      headers: getMedusaHeadersSync(),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then(({ locations }) => {
        const loc = locationId
          ? locations.find(
              (l: { id: string; name: string; address?: string }) =>
                l.id === locationId
            )
          : locations[0]
        if (loc) {
          setLocationName(loc.name)
          setLocationAddress(loc.address ?? null)
        }
      })
      .catch(() => {})
  }, [franchiseId, locationId])

  const persistFulfillment = useCallback(
    async (method: "pickup" | "delivery") => {
      await persistCartMetadata({ fulfillment_method: method })
    },
    [persistCartMetadata]
  )

  const quoteDeliveryFee = useCallback(async () => {
    if (fulfillment !== "delivery" || !locationId || !deliveryPostcode.trim()) {
      setDeliveryFee(0)
      setDeliveryDistanceKm(null)
      setDeliveryFeeError(null)
      return
    }
    setDeliveryFeeLoading(true)
    setDeliveryFeeError(null)
    try {
      const result = await fetchDeliveryFee(locationId, {
        postcode: deliveryPostcode.trim(),
      })
      if (!result.deliverable) {
        setDeliveryFee(0)
        setDeliveryDistanceKm(result.distance_km ?? null)
        setDeliveryFeeError(
          result.message ?? "Delivery is not available to this postcode."
        )
        await persistCartMetadata({
          delivery_fee: 0,
          delivery_postcode: deliveryPostcode.trim(),
          delivery_deliverable: false,
        })
        return
      }
      setDeliveryFee(result.fee)
      setDeliveryDistanceKm(result.distance_km ?? null)
      await persistCartMetadata({
        delivery_fee: result.fee,
        delivery_postcode: deliveryPostcode.trim(),
        delivery_distance_km: result.distance_km,
        delivery_deliverable: true,
      })
    } catch (err) {
      setDeliveryFee(0)
      setDeliveryFeeError(
        err instanceof Error ? err.message : "Could not calculate delivery fee."
      )
    } finally {
      setDeliveryFeeLoading(false)
    }
  }, [fulfillment, locationId, deliveryPostcode, persistCartMetadata])

  useEffect(() => {
    if (fulfillment === "pickup") {
      setDeliveryFee(0)
      setDeliveryFeeError(null)
      setDeliveryDistanceKm(null)
    }
  }, [fulfillment])

  const handleApplyDiscount = async () => {
    if (!cartId || !discountCode.trim()) return
    setDiscountLoading(true)
    setDiscountError(null)
    setDiscountSuccess(null)
    try {
      await applyPromoCode(cartId, discountCode.trim())
      await refreshCart()
      setDiscountSuccess(`Code “${discountCode.trim().toUpperCase()}” applied.`)
      setDiscountCode("")
    } catch (err) {
      setDiscountError(
        err instanceof Error ? err.message : "Could not apply that code."
      )
    } finally {
      setDiscountLoading(false)
    }
  }

  const handleRemoveDiscount = async (code: string) => {
    if (!cartId) return
    setDiscountLoading(true)
    setDiscountError(null)
    try {
      await removePromoCode(cartId, code)
      await refreshCart()
      setDiscountSuccess(null)
    } catch (err) {
      setDiscountError(
        err instanceof Error ? err.message : "Could not remove that code."
      )
    } finally {
      setDiscountLoading(false)
    }
  }

  const currencyCode = cart?.currency_code ?? "GBP"
  const shippingVal =
    (cart?.shipping_total ?? 0) > 0
      ? (cart?.shipping_total ?? 0)
      : fulfillment === "delivery"
        ? deliveryFee
        : 0
  const isInventorySufficient = inventoryResult
    ? inventoryResult.all_sufficient
    : true
  const deliveryOk =
    fulfillment === "pickup" || (deliveryFee > 0 && !deliveryFeeError)
  // Collection window is set per cake on the product page (line custom_attributes).
  const itemsHaveCollectionSlot = cartItemsHaveCollectionSlots(cart?.items)
  const canCheckout =
    itemsHaveCollectionSlot &&
    (cart?.items?.length ?? 0) > 0 &&
    isInventorySufficient &&
    deliveryOk

  const subtotalVal = cart?.subtotal ?? 0
  const taxVal = cart?.tax_total ?? 0
  const discountVal = cart?.discount_total ?? 0
  const appliedPromos = cart?.promotions ?? []
  const finalTotal =
    (cart?.shipping_total ?? 0) > 0 || discountVal > 0
      ? Math.max(0, cart?.total ?? 0)
      : Math.max(0, subtotalVal + shippingVal + taxVal - discountVal)

  return {
    cart,
    isLoading,
    removeFromCart,
    updateQuantity,
    cartId,
    locationId,
    locationName,
    locationAddress,
    locationWarning,
    setLocationWarning,
    fulfillment,
    setFulfillment,
    persistFulfillment,
    deliveryPostcode,
    setDeliveryPostcode,
    deliveryFee,
    deliveryFeeLoading,
    deliveryFeeError,
    deliveryDistanceKm,
    quoteDeliveryFee,
    discountCode,
    setDiscountCode,
    discountLoading,
    discountError,
    setDiscountError,
    discountSuccess,
    setDiscountSuccess,
    handleApplyDiscount,
    handleRemoveDiscount,
    inventoryResult,
    adjustingCart,
    handleAdjustToAvailability,
    currencyCode,
    shippingVal,
    canCheckout,
    subtotalVal,
    taxVal,
    discountVal,
    appliedPromos,
    finalTotal,
  }
}

export type CartPageModel = ReturnType<typeof useCartPage>
