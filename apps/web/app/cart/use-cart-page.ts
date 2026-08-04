"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import type { SlotSelection } from "@/components/time-slot-picker"
import { useCart, type InventoryCheckResult } from "@/lib/cart/cart-context"
import {
  applyCollectionSlotToCart,
  applyPromoCode,
  applyPreferredShippingMethod,
  removePromoCode,
  syncDeliveryQuoteToCart,
  updateCartMetadata,
} from "@/lib/cart/cart-actions"
import {
  amountToFreeDelivery,
  getCartDeliveryPostcode,
  isDeliveryQuoteDeliverable,
  merchandiseSubtotalForDelivery,
  resolveCartTotals,
} from "@/lib/cart/cart-totals"
import { getCustomerAddresses } from "@/lib/auth/account-actions"
import { getMedusaHeadersSync } from "@/lib/medusa/headers"
import {
  defaultMinCollectionDate,
  fetchDeliveryFee,
} from "@/lib/data/logistics"
import { useSelectedStore } from "@/lib/store-selection"
import {
  cartItemsHaveCollectionSlots,
  getCartMetadataCollectionSlot,
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
  const [deliveryDistanceMi, setDeliveryDistanceMi] = useState<number | null>(
    null
  )
  const [deliveryDeliverable, setDeliveryDeliverable] = useState(false)
  /** Merchandise subtotal used for the last successful delivery quote. */
  const lastQuotedSubtotalRef = useRef<number | null>(null)

  const [discountCode, setDiscountCode] = useState("")
  const [discountLoading, setDiscountLoading] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [discountSuccess, setDiscountSuccess] = useState<string | null>(null)

  const [inventoryResult, setInventoryResult] =
    useState<InventoryCheckResult | null>(null)
  const [adjustingCart, setAdjustingCart] = useState(false)

  const [hasHydratedMetadata, setHasHydratedMetadata] = useState(false)

  // Order-level collection window (chosen on cart, stamped onto all lines).
  const [collectionDate, setCollectionDate] = useState(defaultMinCollectionDate())
  const [collectionTime, setCollectionTime] = useState("")
  const [collectionTimeLabel, setCollectionTimeLabel] = useState("")
  const [collectionSlotSaving, setCollectionSlotSaving] = useState(false)
  const [collectionSlotError, setCollectionSlotError] = useState<string | null>(
    null
  )

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
      delivery_distance_mi?: number
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
      if (updates.delivery_distance_mi !== undefined) {
        mergedMetadata.delivery_distance_mi = updates.delivery_distance_mi
      }
      if (updates.delivery_deliverable !== undefined) {
        mergedMetadata.delivery_deliverable = updates.delivery_deliverable
      }

      // Must refresh cart context so checkout/account read the same metadata
      // (previously only local React state had the quoted fee → checkout £25).
      await updateCartMetadata(cartId, mergedMetadata).catch(() => {})
      await refreshCart().catch(() => {})
    },
    [cartId, cart, fulfillment, locationId, franchiseId, refreshCart]
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

    // Prefer cart-level slot (set on this page); fall back to line stamps
    // from older product-page flows so existing carts still hydrate.
    const metaSlot = getCartMetadataCollectionSlot(meta)
    const lineSlot = getMostRecentLineCollectionSlot(cart.items)
    const resolvedSlot = metaSlot ?? lineSlot

    if (resolvedSlot?.date) {
      setCollectionDate(resolvedSlot.date)
    }
    if (resolvedSlot?.time) {
      setCollectionTime(resolvedSlot.time)
      setCollectionTimeLabel(resolvedSlot.label || resolvedSlot.time)
    }

    const pickupDate = resolvedSlot?.date
    const pickupTime = resolvedSlot?.time
    const pickupLabel = resolvedSlot?.label || resolvedSlot?.time || ""

    if (meta?.fulfillment_method) {
      setFulfillment(meta.fulfillment_method as "pickup" | "delivery")
    }
    // Prefer Medusa shipping_total (authoritative) over metadata quote.
    // Free delivery keeps shipping_total at 0 — still trust deliverable metadata.
    if ((cart.shipping_total ?? 0) > 0) {
      setDeliveryFee(cart.shipping_total)
      setDeliveryDeliverable(true)
    } else if (typeof meta?.delivery_fee === "number") {
      setDeliveryFee(meta.delivery_fee)
      setDeliveryDeliverable(meta.delivery_deliverable === true)
    } else if (meta?.delivery_deliverable === true) {
      setDeliveryFee(0)
      setDeliveryDeliverable(true)
    }
    // Postcode SSOT: shipping_address → metadata → address book (gap fill only).
    const cartPostcode = getCartDeliveryPostcode(cart)
    if (cartPostcode) {
      setDeliveryPostcode(cartPostcode)
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
    if (typeof meta?.delivery_distance_mi === "number") {
      setDeliveryDistanceMi(meta.delivery_distance_mi)
    }

    // If lines already have a slot but cart metadata is missing/stale, promote
    // once so checkout can read requested_pickup_*.
    if (lineSlot?.date && lineSlot?.time && !metaSlot) {
      void applyCollectionSlotToCart(cart.id, lineSlot, meta).then(() =>
        refreshCart().catch(() => {})
      )
    }

    // If cart has a slot but some newly added lines are missing date/time,
    // re-stamp all lines so bakers see a consistent order window.
    if (
      metaSlot?.date &&
      metaSlot?.time &&
      cart.items.length > 0 &&
      !cartItemsHaveCollectionSlots(cart.items)
    ) {
      void applyCollectionSlotToCart(cart.id, metaSlot, meta).then(() =>
        refreshCart().catch(() => {})
      )
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
  }, [cart, hasHydratedMetadata, locationId, persistCartMetadata, refreshCart])

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
      if (!cartId) return
      // Attach the matching shipping option so cart.total is payment truth
      // for pickup (free) as well as delivery (quoted).
      if (method === "pickup") {
        setDeliveryFee(0)
        setDeliveryFeeError(null)
        setDeliveryDistanceMi(null)
        setDeliveryDeliverable(false)
        try {
          await applyPreferredShippingMethod(cartId, "pickup", locationId)
          await refreshCart()
        } catch {
          // Shipping options may be unavailable until an address exists;
          // checkout prepare will re-attach.
        }
      }
    },
    [persistCartMetadata, cartId, locationId, refreshCart]
  )

  const handleCollectionDateChange = useCallback((date: string) => {
    setCollectionDate(date)
    setCollectionTime("")
    setCollectionTimeLabel("")
    setCollectionSlotError(null)
  }, [])

  const handleCollectionSlotChange = useCallback(
    async (slot: SlotSelection | null) => {
      if (!slot) {
        setCollectionTime("")
        setCollectionTimeLabel("")
        return
      }

      setCollectionDate(slot.date)
      setCollectionTime(slot.time)
      setCollectionTimeLabel(slot.label || slot.time)
      setCollectionSlotError(null)

      if (!cartId) return

      setCollectionSlotSaving(true)
      try {
        await applyCollectionSlotToCart(
          cartId,
          {
            date: slot.date,
            time: slot.time,
            label: slot.label || slot.time,
          },
          cart?.metadata ?? null
        )
        await refreshCart()
      } catch (err) {
        setCollectionSlotError(
          err instanceof Error
            ? err.message
            : "Could not save collection date and time."
        )
      } finally {
        setCollectionSlotSaving(false)
      }
    },
    [cartId, cart?.metadata, refreshCart]
  )

  // When items are added after a slot is already chosen, stamp them once per
  // cart-lines signature so every line carries the same order-level window.
  const stampedItemsSignatureRef = useRef<string>("")
  useEffect(() => {
    if (!cartId || !cart?.items?.length || !hasHydratedMetadata) return
    if (!collectionDate || !collectionTime) return
    if (cartItemsHaveCollectionSlots(cart.items)) {
      stampedItemsSignatureRef.current = itemsSignature
      return
    }
    if (stampedItemsSignatureRef.current === itemsSignature) return
    stampedItemsSignatureRef.current = itemsSignature

    let cancelled = false
    setCollectionSlotSaving(true)
    void applyCollectionSlotToCart(
      cartId,
      {
        date: collectionDate,
        time: collectionTime,
        label: collectionTimeLabel || collectionTime,
      },
      cart.metadata ?? null
    )
      .then(() => {
        if (!cancelled) return refreshCart()
      })
      .catch(() => {
        // Allow a later items change to retry; do not tight-loop on failure.
      })
      .finally(() => {
        if (!cancelled) setCollectionSlotSaving(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    cartId,
    cart?.items,
    cart?.metadata,
    hasHydratedMetadata,
    collectionDate,
    collectionTime,
    collectionTimeLabel,
    itemsSignature,
    refreshCart,
  ])

  const quoteDeliveryFee = useCallback(async () => {
    if (fulfillment !== "delivery" || !locationId || !deliveryPostcode.trim()) {
      setDeliveryFee(0)
      setDeliveryDistanceMi(null)
      setDeliveryDeliverable(false)
      setDeliveryFeeError(null)
      return
    }
    if (!cartId) return
    setDeliveryFeeLoading(true)
    setDeliveryFeeError(null)
    try {
      const subtotalForQuote = merchandiseSubtotalForDelivery(cart)
      const result = await fetchDeliveryFee(
        locationId,
        { postcode: deliveryPostcode.trim() },
        { merchandiseSubtotal: subtotalForQuote }
      )
      // Persist fee + postcode to cart (metadata + shipping_address) and
      // attach local-delivery shipping method so cart.total / shipping_total
      // match what checkout and payment will charge.
      const updated = await syncDeliveryQuoteToCart(cartId, {
        postcode: deliveryPostcode.trim(),
        fee: result.fee,
        distance_mi: result.distance_mi ?? null,
        deliverable: result.deliverable,
        storeLocationId: locationId,
        existingMetadata: cart?.metadata ?? null,
      })
      await refreshCart()

      if (!result.deliverable) {
        setDeliveryFee(0)
        setDeliveryDeliverable(false)
        setDeliveryDistanceMi(result.distance_mi ?? null)
        setDeliveryFeeError(
          result.message ?? "Delivery is not available to this postcode."
        )
        return
      }

      // Prefer Medusa shipping_total when the method attached successfully.
      // Free delivery leaves shipping_total at 0 — use result.fee (0).
      const charged =
        (updated.shipping_total ?? 0) > 0
          ? updated.shipping_total
          : result.fee
      setDeliveryFee(charged)
      setDeliveryDeliverable(true)
      setDeliveryDistanceMi(result.distance_mi ?? null)
      lastQuotedSubtotalRef.current = subtotalForQuote
    } catch (err) {
      setDeliveryFee(0)
      setDeliveryDeliverable(false)
      setDeliveryFeeError(
        err instanceof Error ? err.message : "Could not calculate delivery fee."
      )
    } finally {
      setDeliveryFeeLoading(false)
    }
  }, [
    fulfillment,
    locationId,
    deliveryPostcode,
    cartId,
    cart,
    refreshCart,
  ])

  useEffect(() => {
    if (fulfillment === "pickup") {
      setDeliveryFee(0)
      setDeliveryFeeError(null)
      setDeliveryDistanceMi(null)
      setDeliveryDeliverable(false)
      lastQuotedSubtotalRef.current = null
    }
  }, [fulfillment])

  // Re-quote when item merchandise changes so free-over-£150 flips automatically.
  // Merchandise SSOT excludes shipping/tax (see merchandiseSubtotalForDelivery).
  const merchandiseSubtotal = merchandiseSubtotalForDelivery(cart)
  useEffect(() => {
    if (fulfillment !== "delivery") return
    if (!deliveryPostcode.trim() || !locationId || !cartId) return
    if (deliveryFeeLoading) return
    // Only re-quote when we already have a successful quote (local or cart meta).
    if (!deliveryDeliverable && !isDeliveryQuoteDeliverable(cart)) return

    // First observation after a deliverable quote: always re-validate free-over
    // against current item merchandise (stale free/paid metadata after restore).
    if (lastQuotedSubtotalRef.current == null) {
      lastQuotedSubtotalRef.current = merchandiseSubtotal
      void quoteDeliveryFee()
      return
    }
    if (Math.abs(lastQuotedSubtotalRef.current - merchandiseSubtotal) < 0.001) {
      return
    }
    void quoteDeliveryFee()
  }, [
    merchandiseSubtotal,
    fulfillment,
    deliveryPostcode,
    locationId,
    cartId,
    deliveryDeliverable,
    deliveryFeeLoading,
    cart,
    quoteDeliveryFee,
  ])

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
  // Single totals path shared with checkout (cart.shipping_total when set,
  // else metadata quote / local quote while hydrating).
  const totals = resolveCartTotals(cart, {
    localDeliveryFee:
      fulfillment === "delivery" && !deliveryFeeError ? deliveryFee : 0,
  })
  // Pickup is always free on the cart UI; delivery uses resolved shipping.
  const shippingVal = fulfillment === "pickup" ? 0 : totals.shipping
  const isInventorySufficient = inventoryResult
    ? inventoryResult.all_sufficient
    : true
  const deliveryOk =
    fulfillment === "pickup" ||
    (deliveryDeliverable && !deliveryFeeError) ||
    ((deliveryFee > 0 || totals.shipping > 0) && !deliveryFeeError)
  // Collection window is set once on the cart (order-level) and stamped on lines.
  // Gate on persisted data (lines or cart metadata), not local draft state.
  const itemsHaveCollectionSlot =
    cartItemsHaveCollectionSlots(cart?.items) ||
    getCartMetadataCollectionSlot(
      (cart?.metadata as Record<string, unknown> | null) ?? null
    ) != null
  const canCheckout =
    itemsHaveCollectionSlot &&
    (cart?.items?.length ?? 0) > 0 &&
    isInventorySufficient &&
    deliveryOk &&
    !collectionSlotSaving

  const subtotalVal = totals.subtotal
  const taxVal = totals.tax
  const discountVal = totals.discount
  const appliedPromos = cart?.promotions ?? []
  // When UI is on pickup but a prior delivery method is still attached,
  // strip shipping from the grand total so the shopper is not charged for
  // delivery they unselected (prepareCartForCheckout re-attaches pickup).
  const finalTotal =
    fulfillment === "pickup" && (cart?.shipping_total ?? 0) > 0
      ? Math.max(0, (cart?.total ?? 0) - (cart?.shipping_total ?? 0))
      : fulfillment === "pickup"
        ? Math.max(0, totals.subtotal + totals.tax - totals.discount)
        : totals.total

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
    collectionDate,
    collectionTime,
    handleCollectionDateChange,
    handleCollectionSlotChange,
    collectionSlotSaving,
    collectionSlotError,
    deliveryPostcode,
    setDeliveryPostcode,
    deliveryFee,
    deliveryFeeLoading,
    deliveryFeeError,
    deliveryDistanceMi,
    deliveryDeliverable,
    amountToFreeDelivery: amountToFreeDelivery(merchandiseSubtotal),
    merchandiseSubtotal,
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
