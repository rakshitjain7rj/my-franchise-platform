"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCart, type InventoryCheckResult } from "@/lib/cart/cart-context"
import {
  applyPromoCode,
  removePromoCode,
  updateCartMetadata,
} from "@/lib/cart/cart-actions"
import { getCustomerAddresses } from "@/lib/auth/account-actions"
import { getMedusaHeadersSync } from "@/lib/medusa/headers"
import {
  isHiddenAttrKey,
  labelForAttrKey,
} from "@/types/cake-metadata"
import {
  defaultMinCollectionDate,
  fetchDeliveryFee,
} from "@/lib/data/logistics"
import TimeSlotPicker, {
  type SlotSelection,
} from "@/components/time-slot-picker"
import Header from "../components/Header"
import Footer from "../components/Footer"
import LocationWarningBanner from "./LocationWarningBanner"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency?.toUpperCase() ?? "GBP",
    maximumFractionDigits: 2,
  }).format(amount)
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.split("; ").find((r) => r.startsWith(`${name}=`))
  return m ? decodeURIComponent(m.split("=")[1]) : null
}

/** Tag colour cycling for custom attributes */
const TAG_COLOURS = [
  "bg-[#FFE4F3] text-[#C0135A]",
  "bg-[#E8F4FF] text-[#1565C0]",
  "bg-[#E8F9EF] text-[#1B6B3A]",
  "bg-[#FFF3E0] text-[#E65100]",
  "bg-[#EDE7F6] text-[#512DA8]",
]

interface CartPageClientProps {
  franchiseId: string
  storeLocationId: string | null
}

export default function CartPageClient({
  franchiseId,
  storeLocationId: initialLocationId,
}: CartPageClientProps) {
  const {
    cart,
    isLoading,
    removeFromCart,
    updateQuantity,
    cartId,
    refreshCart,
  } = useCart()
  const router = useRouter()

  // ── Location ────────────────────────────────────────────────────────────
  const [locationId, setLocationId] = useState(initialLocationId)
  const [locationName, setLocationName] = useState<string | null>(null)
  const [locationAddress, setLocationAddress] = useState<string | null>(null)
  const [locationWarning, setLocationWarning] = useState<string | null>(null)

  // ── Fulfillment ─────────────────────────────────────────────────────────
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup")

  // ── Scheduling (backend-driven 30-min slots) ─────────────────────────────
  const [selectedDate, setSelectedDate] = useState(defaultMinCollectionDate())
  /** Slot start HH:mm (canonical) */
  const [selectedTime, setSelectedTime] = useState("")
  const [selectedTimeLabel, setSelectedTimeLabel] = useState("")

  // ── Delivery fee (backend-computed) ─────────────────────────────────────
  const [deliveryPostcode, setDeliveryPostcode] = useState("")
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false)
  const [deliveryFeeError, setDeliveryFeeError] = useState<string | null>(null)
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(
    null
  )

  // ── Discount (Medusa promotions — never invent a client-side amount) ────
  const [discountCode, setDiscountCode] = useState("")
  const [discountLoading, setDiscountLoading] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [discountSuccess, setDiscountSuccess] = useState<string | null>(null)

  // ── Inventory Check ──────────────────────────────────────────────────────
  const { checkInventory } = useCart()
  const [inventoryResult, setInventoryResult] = useState<InventoryCheckResult | null>(null)
  const [adjustingCart, setAdjustingCart] = useState(false)

  const itemsSignature = cart?.items?.map((i) => `${i.id}-${i.quantity}`).join(",") ?? ""

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
  }, [cartId, locationId, itemsSignature, checkInventory])

  // One-click fix when the selected bakery can't cover the cart: drop items
  // with no stock at this branch and cap the rest at what's available. The
  // quantity/removal updates change the items signature, which re-runs the
  // inventory check automatically.
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

  // ── Persist consolidated metadata to cart ───────────────────────────────
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
        requested_pickup_date: updates.requested_pickup_date ?? selectedDate,
        requested_pickup_time: updates.requested_pickup_time ?? selectedTime,
        franchise_id: currentMeta?.franchise_id ?? franchiseId,
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
    [cartId, cart, fulfillment, locationId, selectedDate, selectedTime, franchiseId]
  )

  // ── Hydrate states from loaded cart metadata ──────────────────────────────
  // Prefer cart-level requested_pickup_* (set on add-to-cart / cart picker).
  // Fall back to the most recent line item's custom_attributes so a slot
  // chosen on the product page still appears even on older carts that only
  // stored date/time on the line item.
  const [hasHydratedMetadata, setHasHydratedMetadata] = useState(false)
  useEffect(() => {
    if (!cart) {
      setHasHydratedMetadata(false)
      return
    }
    if (hasHydratedMetadata) return

    const meta = cart.metadata as Record<string, unknown> | null

    // Line-item fallback for date/time when cart metadata is empty
    let lineDate: string | undefined
    let lineTime: string | undefined
    if (cart.items?.length) {
      for (let i = cart.items.length - 1; i >= 0; i--) {
        const attrs = cart.items[i]?.metadata?.custom_attributes as
          | Record<string, string>
          | undefined
        if (attrs?.date || attrs?.time) {
          lineDate = typeof attrs.date === "string" ? attrs.date : undefined
          lineTime = typeof attrs.time === "string" ? attrs.time : undefined
          break
        }
      }
    }

    const pickupDate =
      (typeof meta?.requested_pickup_date === "string" &&
        meta.requested_pickup_date) ||
      lineDate ||
      undefined
    const pickupTime =
      (typeof meta?.requested_pickup_time === "string" &&
        meta.requested_pickup_time) ||
      lineTime ||
      undefined
    const pickupLabel =
      (typeof meta?.requested_pickup_label === "string" &&
        meta.requested_pickup_label) ||
      (pickupTime && !/^\d{2}:\d{2}$/.test(pickupTime) ? pickupTime : "") ||
      ""

    if (meta?.fulfillment_method) {
      setFulfillment(meta.fulfillment_method as "pickup" | "delivery")
    }
    if (pickupDate) {
      setSelectedDate(pickupDate)
    }
    if (pickupTime) {
      setSelectedTime(pickupTime)
    }
    if (pickupLabel) {
      setSelectedTimeLabel(pickupLabel)
    }
    if (typeof meta?.delivery_fee === "number") {
      setDeliveryFee(meta.delivery_fee)
    }
    if (typeof meta?.delivery_postcode === "string") {
      setDeliveryPostcode(meta.delivery_postcode)
    } else {
      // No cart postcode yet — seed from the shopper's default saved address
      // so delivery fee quotes work without re-typing a known postcode.
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

    // Promote line-item-only slots onto cart metadata so checkout reads them.
    const needsSlotPromote =
      Boolean(pickupDate && pickupTime) &&
      (!meta?.requested_pickup_date || !meta?.requested_pickup_time)
    if (needsSlotPromote && pickupDate && pickupTime) {
      const isHHmm = /^\d{2}:\d{2}$/.test(pickupTime)
      persistCartMetadata({
        requested_pickup_date: pickupDate,
        requested_pickup_time: pickupTime,
        requested_pickup_label: pickupLabel || pickupTime,
        requested_pickup_iso: isHHmm
          ? `${pickupDate}T${pickupTime}:00`
          : undefined,
      })
    }

    // The bakery may have been switched (map-routing page) while the cart
    // page wasn't open — the cookie is then ahead of the cart's metadata.
    // Also backfill when cart.metadata.store_location_id is missing entirely
    // (restored carts / cookie-only selection). Without this, delivery
    // shipping-method price calc fails with "requires a selected bakery".
    const cartStore = meta?.store_location_id as string | undefined
    if (locationId && cartStore !== locationId) {
      if (cartStore) {
        setLocationWarning(
          "Your selected bakery has changed since these treats were added. " +
            "We've moved your cart to the new bakery — please review each item's availability below."
        )
      }
      persistCartMetadata({
        store_location_id: locationId,
        fulfillment_method:
          (meta?.fulfillment_method as "pickup" | "delivery") ?? "pickup",
        requested_pickup_date: pickupDate,
        requested_pickup_time: pickupTime,
        requested_pickup_label: pickupLabel || undefined,
      })
    }

    setHasHydratedMetadata(true)
  }, [cart, hasHydratedMetadata, locationId, persistCartMetadata])

  // ── Load location name/address ───────────────────────────────────────────
  useEffect(() => {
    if (!franchiseId) return
    fetch(`${BACKEND_URL}/store/franchises/${franchiseId}/locations`, {
      headers: getMedusaHeadersSync(),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then(({ locations }) => {
        const loc = locationId
          ? locations.find((l: { id: string; name: string; address?: string }) => l.id === locationId)
          : locations[0]
        if (loc) {
          setLocationName(loc.name)
          setLocationAddress(loc.address ?? null)
        }
      })
      .catch(() => {})
  }, [franchiseId, locationId])

  // ── Watch for location cookie changes ────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const current = getCookie("selected_store_location_id")
      if (current && current !== locationId) {
        setLocationId(current)
        setLocationWarning("Bakery location changed. Please review your cart.")
        setSelectedTime("")
        setSelectedTimeLabel("")
        persistCartMetadata({
          store_location_id: current,
          requested_pickup_time: "",
          requested_pickup_label: "",
        })
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [locationId, persistCartMetadata])

  // ── Persist fulfillment to cart metadata ─────────────────────────────────
  const persistFulfillment = useCallback(
    async (method: "pickup" | "delivery") => {
      await persistCartMetadata({ fulfillment_method: method })
    },
    [persistCartMetadata]
  )

  // ── Persist slot to cart metadata ────────────────────────────────────────
  const handleSlotChange = useCallback(
    async (slot: SlotSelection | null) => {
      if (!slot) {
        setSelectedTime("")
        setSelectedTimeLabel("")
        return
      }
      setSelectedTime(slot.time)
      setSelectedTimeLabel(slot.label)
      await persistCartMetadata({
        requested_pickup_date: slot.date,
        requested_pickup_time: slot.time,
        requested_pickup_label: slot.label,
        // ISO for any consumers that parse a full timestamp
        requested_pickup_iso: `${slot.date}T${slot.time}:00`,
      })
    },
    [persistCartMetadata]
  )

  const handleDateChange = useCallback(
    async (next: string) => {
      setSelectedDate(next)
      setSelectedTime("")
      setSelectedTimeLabel("")
      await persistCartMetadata({
        requested_pickup_date: next,
        requested_pickup_time: "",
        requested_pickup_label: "",
      })
    },
    [persistCartMetadata]
  )

  // ── Delivery fee quote when postcode + delivery mode ────────────────────
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
  const totalItems = cart?.items.reduce((a, i) => a + i.quantity, 0) ?? 0
  // Delivery quote is backend-computed for radius/UX; Medusa shipping_total is
  // what will actually be charged once a shipping method is attached at checkout.
  const shippingVal =
    (cart?.shipping_total ?? 0) > 0
      ? (cart?.shipping_total ?? 0)
      : fulfillment === "delivery"
        ? deliveryFee
        : 0
  const isInventorySufficient = inventoryResult ? inventoryResult.all_sufficient : true
  const deliveryOk =
    fulfillment === "pickup" ||
    (deliveryFee > 0 && !deliveryFeeError)
  const canCheckout =
    selectedTime !== "" &&
    (cart?.items?.length ?? 0) > 0 &&
    isInventorySufficient &&
    deliveryOk

  const subtotalVal = cart?.subtotal ?? 0
  const taxVal = cart?.tax_total ?? 0
  const discountVal = cart?.discount_total ?? 0
  const appliedPromos = cart?.promotions ?? []
  // Prefer Medusa cart.total when discounts/shipping are already on the cart
  // so the number matches what PayPal/Medusa will charge.
  const finalTotal =
    (cart?.shipping_total ?? 0) > 0 || discountVal > 0
      ? Math.max(0, cart?.total ?? 0)
      : Math.max(0, subtotalVal + shippingVal + taxVal - discountVal)

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!isLoading && (!cart?.items || cart.items.length === 0)) {
    return (
      <div className="flex flex-col min-h-screen bg-[#EEDFF5] font-body selection:bg-secondary selection:text-on-secondary">
        <Header />
        <main className="flex-grow flex items-center justify-center pt-28 pb-16">
          <div className="text-center space-y-6 max-w-md mx-auto px-6 py-12 bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm">
            <div className="w-24 h-24 mx-auto rounded-full bg-secondary/10 flex items-center justify-center">
              <span className="material-symbols-outlined !text-[48px] text-secondary">
                shopping_basket
              </span>
            </div>
            <h1 className="font-headline font-bold text-3xl text-primary">Your cart is empty</h1>
            <p className="text-on-surface-variant text-sm max-w-xs mx-auto leading-relaxed">
              Explore our selection of handcrafted artisanal treats and find something sweet to order.
            </p>
            <Link
              href="/cake-catalogue"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-deep-plum text-white font-headline font-bold text-sm uppercase tracking-widest hover:bg-secondary transition-all hover:scale-[1.02] shadow-md hover:shadow-lg active:scale-[0.98]"
            >
              <span className="material-symbols-outlined !text-[18px]">storefront</span>
              Browse Cakes
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#EEDFF5] font-body selection:bg-secondary selection:text-on-secondary">
      <Header />
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-8 lg:py-16 bg-transparent pt-28">
        
        {/* Title */}
        <div className="mb-10">
          <h1 className="font-headline text-[32px] md:text-[40px] font-extrabold tracking-tight text-primary">
            Your Confectionery Cart
          </h1>
          <p className="text-on-surface-variant text-body-lg mt-2">
            Review your selection before we start baking.
          </p>
        </div>

        {locationWarning && (
          <LocationWarningBanner
            message={locationWarning}
            onDismiss={() => setLocationWarning(null)}
          />
        )}

        {/* Availability conflict at the selected bakery */}
        {inventoryResult && !inventoryResult.all_sufficient && (cart?.items?.length ?? 0) > 0 && (
          <div
            className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 flex items-start gap-4"
            role="alert"
            id="availability-conflict-banner"
          >
            <span className="material-symbols-outlined text-red-500 !text-[24px] mt-0.5 shrink-0">
              production_quantity_limits
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-label-bold text-sm text-red-800">
                {inventoryResult.reason === "STORE_HAS_NO_STOCK_LOCATION"
                  ? "This bakery can't take orders right now"
                  : `Some treats aren't available at ${locationName ?? "this bakery"}`}
              </p>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                {inventoryResult.reason === "STORE_HAS_NO_STOCK_LOCATION"
                  ? inventoryResult.message ??
                    "This location's inventory is not configured yet. Please choose another bakery to continue."
                  : "The items flagged below are out of stock or short at your selected bakery. Adjust your cart, or pick a different bakery that has them."}
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                {inventoryResult.reason !== "STORE_HAS_NO_STOCK_LOCATION" && (
                  <button
                    type="button"
                    onClick={handleAdjustToAvailability}
                    disabled={adjustingCart || isLoading}
                    className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-label-bold text-xs px-4 py-2 rounded-full transition-colors"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {adjustingCart ? "progress_activity" : "auto_fix"}
                    </span>
                    {adjustingCart ? "Adjusting…" : "Adjust cart to availability"}
                  </button>
                )}
                <Link
                  href="/map-routing?redirect=/cart"
                  className="inline-flex items-center gap-1.5 border border-red-300 text-red-700 hover:bg-red-100 font-label-bold text-xs px-4 py-2 rounded-full transition-colors"
                >
                  <span className="material-symbols-outlined !text-[14px]">storefront</span>
                  Choose another bakery
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 relative">
          {/* LEFT COLUMN: 65% width */}
          <div className="w-full lg:w-[65%] flex flex-col gap-10">
            
            {/* Selected Treats */}
            <section className="flex flex-col gap-6">
              <h2 className="font-headline text-2xl font-bold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary" data-weight="fill">shopping_basket</span>
                Selected Treats
              </h2>
              
              {isLoading && (!cart || !cart.items || cart.items.length === 0) ? (
                <div className="flex flex-col gap-4 animate-pulse">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-surface-container-lowest rounded-2xl p-4 flex flex-col sm:flex-row gap-6 border border-surface-container shadow-sm relative overflow-hidden h-36">
                      {/* Left Highlight */}
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary-container/20"></div>
                      
                      {/* Image Placeholder */}
                      <div className="w-full sm:w-32 h-full flex-shrink-0 rounded-xl bg-surface-container/60" />

                      {/* Details Placeholder */}
                      <div className="flex flex-col justify-between flex-grow gap-4">
                        <div className="flex flex-col gap-3">
                          <div className="h-5 bg-surface-container rounded-md w-1/3" />
                          <div className="flex flex-wrap gap-2 mt-1">
                            <div className="h-5 bg-surface-container rounded-full w-16" />
                            <div className="h-5 bg-surface-container rounded-full w-20" />
                            <div className="h-5 bg-surface-container rounded-full w-24" />
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="h-8 bg-surface-container rounded-full w-24" />
                          <div className="h-6 bg-surface-container rounded w-16" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`flex flex-col gap-4 transition-opacity duration-200 ${isLoading ? "opacity-60 pointer-events-none" : ""}`}>
                  {cart?.items.map((item) => {
                    const meta = item.metadata as Record<string, unknown> | null
                    const customAttrs = meta?.custom_attributes as Record<string, string> | undefined
                    const inscription = meta?.inscription as string | undefined
                    const invItem = inventoryResult?.items.find((i) => i.variant_id === item.variant_id)
                    const isSufficient = invItem ? invItem.is_sufficient : true
                    const availableQty = invItem ? invItem.available_quantity : null

                    return (
                      <div key={item.id} className="bg-surface-container-lowest rounded-2xl p-4 flex flex-col sm:flex-row gap-6 border border-surface-container shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group rounded-lg">
                        {/* Subtle Left Highlight */}
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary-container opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        
                        {/* Image */}
                        <div className="w-full sm:w-32 h-32 flex-shrink-0 rounded-xl overflow-hidden bg-surface-container">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-on-surface/5">
                              <span className="material-symbols-outlined text-[36px] text-on-surface-variant/20">cake</span>
                            </div>
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex flex-col justify-between flex-grow gap-4">
                          <div>
                            <div className="flex justify-between items-start gap-4">
                              <h3 className="font-headline text-lg font-bold text-primary leading-tight">{item.title}</h3>
                              <button
                                onClick={() => removeFromCart(item.id)}
                                aria-label="Remove item"
                                className="text-on-surface-variant hover:text-error transition-colors p-1 rounded-full hover:bg-error-container"
                              >
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            </div>

                            {/* Custom Attributes (canonical keys → human labels) */}
                            {customAttrs && Object.keys(customAttrs).length > 0 ? (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {Object.entries(customAttrs)
                                  .filter(([k, v]) => v && !isHiddenAttrKey(k))
                                  .map(([k, v], idx) => {
                                    const isSecondaryColor =
                                      /flavou?r/i.test(k) || idx % 2 === 1
                                    const badgeClass = isSecondaryColor
                                      ? "bg-secondary-fixed text-on-secondary-fixed"
                                      : "bg-tertiary-fixed text-on-tertiary-fixed";
                                    return (
                                      <span key={k} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
                                        {labelForAttrKey(k)}: {v}
                                      </span>
                                    )
                                  })}
                                {typeof customAttrs.photo_url === "string" &&
                                  customAttrs.photo_url && (
                                    <a
                                      href={customAttrs.photo_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary-fixed text-on-secondary-fixed"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={customAttrs.photo_url}
                                        alt=""
                                        className="w-4 h-4 rounded object-cover"
                                      />
                                      Photo
                                    </a>
                                  )}
                              </div>
                            ) : item.variant_title && item.variant_title !== "Default Variant" ? (
                              <div className="flex flex-wrap gap-2 mt-2">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-tertiary-fixed text-on-tertiary-fixed">
                                  {item.variant_title}
                                </span>
                              </div>
                            ) : null}

                            {/* Inscription */}
                            {inscription && (
                              <p className="text-sm text-on-surface-variant mt-3 italic text-gray-500 border-l-2 border-outline-variant pl-2">
                                &ldquo;{inscription}&rdquo;
                              </p>
                            )}

                            {/* Inventory warnings */}
                            {!isSufficient && (
                              <div className="text-xs text-red-600 font-semibold flex items-center gap-1.5 mt-2 bg-red-50 border border-red-200/50 px-3 py-1.5 rounded-xl">
                                <span className="material-symbols-outlined !text-[16px] text-red-500">warning</span>
                                <span>Insufficient stock at this location (Only {availableQty ?? 0} available).</span>
                              </div>
                            )}
                          </div>

                          {/* Quantity & Price */}
                          <div className="flex justify-between items-center mt-4">
                            <div className="flex items-center bg-surface-container rounded-full border border-outline-variant/30">
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                className="w-8 h-8 flex items-center justify-center text-on-surface hover:text-primary hover:bg-surface-variant rounded-l-full transition-colors"
                              >
                                <span className="material-symbols-outlined text-[18px]">remove</span>
                              </button>
                              <span className="w-8 text-center font-medium text-sm text-primary">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                className="w-8 h-8 flex items-center justify-center text-on-surface hover:text-primary hover:bg-surface-variant rounded-r-full transition-colors"
                              >
                                <span className="material-symbols-outlined text-[18px]">add</span>
                              </button>
                            </div>
                            <div className="font-headline font-bold text-primary text-lg">
                              {fmt(item.unit_price * item.quantity, item.currency_code)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              
              <div className="mt-2">
                <Link
                  href="/cake-catalogue"
                  className="inline-flex items-center gap-1 text-sm font-bold text-secondary hover:text-secondary-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Add more treats
                </Link>
              </div>
            </section>

            <hr className="border-surface-variant border-t" />

            {/* Fulfillment Selector */}
            <section className="flex flex-col gap-4">
              <h2 className="font-headline text-xl font-bold text-primary">How would you like to receive this?</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Option 1: Pickup */}
                <button
                  type="button"
                  onClick={() => {
                    setFulfillment("pickup")
                    persistFulfillment("pickup")
                  }}
                  className={`w-full p-6 rounded-xl border-2 transition-all flex flex-col gap-4 text-left ${
                    fulfillment === "pickup"
                      ? "border-secondary bg-secondary-fixed/20"
                      : "border-outline-variant/30 bg-surface-container-lowest hover:border-secondary-container"
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-secondary/10 text-secondary">
                        <span className="material-symbols-outlined text-[24px]" data-weight="fill">storefront</span>
                      </div>
                      <div>
                        <span className="block font-headline font-bold text-primary text-base">Store Pickup</span>
                        <span className="text-[12px] font-medium text-secondary uppercase tracking-wider">Complimentary</span>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      fulfillment === "pickup" ? "border-secondary" : "border-outline-variant"
                    }`}>
                      <div className={`w-3 h-3 rounded-full bg-secondary transition-transform duration-200 ${
                        fulfillment === "pickup" ? "scale-100" : "scale-0"
                      }`} />
                    </div>
                  </div>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Collect your fresh treats from our Soho bakery within your chosen time window.
                  </p>
                </button>

                {/* Option 2: Delivery */}
                <button
                  type="button"
                  onClick={() => {
                    setFulfillment("delivery")
                    persistFulfillment("delivery")
                  }}
                  className={`w-full p-6 rounded-xl border-2 transition-all flex flex-col gap-4 text-left ${
                    fulfillment === "delivery"
                      ? "border-secondary bg-secondary-fixed/20"
                      : "border-outline-variant/30 bg-surface-container-lowest hover:border-secondary-container"
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/5 text-primary">
                        <span className="material-symbols-outlined text-[24px]">local_shipping</span>
                      </div>
                      <div>
                        <span className="block font-headline font-bold text-primary text-base">Local Delivery</span>
                        <span className="text-[12px] font-medium text-on-surface-variant uppercase tracking-wider">
                          {fmt(1500, currencyCode)} Flat Rate
                        </span>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      fulfillment === "delivery" ? "border-secondary" : "border-outline-variant"
                    }`}>
                      <div className={`w-3 h-3 rounded-full bg-secondary transition-transform duration-200 ${
                        fulfillment === "delivery" ? "scale-100" : "scale-0"
                      }`} />
                    </div>
                  </div>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Curated delivery by our dedicated team within a 10-mile radius of our patisserie.
                  </p>
                </button>
              </div>

              {/* Selected Store Details */}
              {fulfillment === "pickup" && locationName && (
                <div className="mt-4 p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-tertiary-fixed/50 flex items-center justify-center text-tertiary">
                    <span className="material-symbols-outlined">location_on</span>
                  </div>
                  <div className="flex-grow">
                    <div className="flex justify-between items-start">
                      <h4 className="font-headline font-bold text-primary text-sm">Selected Pickup Location</h4>
                      <Link
                        href={`/map-routing?redirect=/cart`}
                        className="text-secondary hover:text-secondary-container text-xs font-bold uppercase tracking-widest transition-colors"
                      >
                        Change Store
                      </Link>
                    </div>
                    <p className="text-on-surface-variant text-sm mt-1 font-medium">{locationName}</p>
                    {locationAddress && (
                      <p className="text-on-surface-variant/70 text-xs">{locationAddress}</p>
                    )}
                  </div>
                </div>
              )}
            </section>

            <hr className="border-surface-variant border-t" />

            {/* Baking Concierge Scheduling */}
            <section className="flex flex-col gap-5 pb-8 lg:pb-0">
              <div>
                <h2 className="font-headline text-xl font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary-container">calendar_clock</span>
                  Baking Concierge Scheduling
                </h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  Live 30-minute windows from your bakery&apos;s opening hours and capacity.
                </p>
              </div>
              <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-container shadow-sm">
                <TimeSlotPicker
                  storeLocationId={locationId}
                  date={selectedDate}
                  selectedTime={selectedTime}
                  onDateChange={handleDateChange}
                  onSlotChange={handleSlotChange}
                />
                {selectedTimeLabel && (
                  <p className="text-xs text-on-surface-variant mt-3">
                    Selected: <strong className="text-primary">{selectedDate}</strong>{" "}
                    · {selectedTimeLabel}
                  </p>
                )}
              </div>

              {/* Delivery postcode quote */}
              {fulfillment === "delivery" && (
                <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-container shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
                    Delivery postcode
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={deliveryPostcode}
                      onChange={(e) => setDeliveryPostcode(e.target.value.toUpperCase())}
                      placeholder="e.g. SW1A 1AA"
                      className="flex-1 rounded-xl border border-outline-variant px-3 py-2.5 text-sm uppercase tracking-wide focus:outline-none focus:border-secondary"
                    />
                    <button
                      type="button"
                      onClick={quoteDeliveryFee}
                      disabled={deliveryFeeLoading || !deliveryPostcode.trim()}
                      className="h-11 px-5 rounded-full bg-deep-plum text-white text-xs font-label-bold uppercase tracking-widest hover:bg-vibrant-magenta disabled:opacity-50 transition-colors"
                    >
                      {deliveryFeeLoading ? "Calculating…" : "Get fee"}
                    </button>
                  </div>
                  {deliveryFeeError && (
                    <p className="text-xs text-red-600" role="alert">
                      {deliveryFeeError}
                    </p>
                  )}
                  {!deliveryFeeError && deliveryFee > 0 && (
                    <p className="text-xs text-on-surface-variant">
                      Delivery fee:{" "}
                      <strong className="text-primary">
                        {fmt(deliveryFee, currencyCode)}
                      </strong>
                      {deliveryDistanceKm != null && (
                        <> · ~{deliveryDistanceKm.toFixed(1)} km</>
                      )}
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT COLUMN: Sticky Order Summary (35%) */}
          <div className="w-full lg:w-[35%]">
            <div className="sticky top-24 bg-white rounded-lg shadow-sm border border-outline-variant p-6">
              <h2 className="text-lg font-semibold font-headline text-primary mb-6">Order Summary</h2>
              
              {/* Dynamic Items List */}
              <ul className="space-y-4 mb-6">
                {cart?.items.map((item) => {
                  const meta = item.metadata as Record<string, unknown> | null
                  const customAttrs = meta?.custom_attributes as Record<string, string> | undefined
                  return (
                    <li key={item.id} className="flex items-center">
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-on-surface/5 relative">
                        {item.thumbnail ? (
                          <img alt={item.title} className="h-full w-full object-cover" src={item.thumbnail} />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-on-surface/5">
                            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/30">cake</span>
                          </div>
                        )}
                        <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="ml-4 flex flex-1 flex-col">
                        <div className="flex justify-between text-sm font-medium text-on-surface">
                          <h3 className="font-headline">{item.title}</h3>
                          <p className="">{fmt(item.unit_price * item.quantity, item.currency_code)}</p>
                        </div>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {item.variant_title && item.variant_title !== "Default Variant"
                            ? item.variant_title
                            : customAttrs && Object.values(customAttrs).filter(Boolean).length > 0
                            ? Object.values(customAttrs).filter(Boolean).join(", ")
                            : "Standard Selection"}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>

              {/* Promo Input — Medusa promotions engine (e.g. CAKEBREAK) */}
              <div className="mb-6 pt-6 border-t border-outline-variant">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => {
                      setDiscountCode(e.target.value)
                      setDiscountError(null)
                      setDiscountSuccess(null)
                    }}
                    placeholder="Discount code"
                    id="discount-code-input"
                    disabled={discountLoading}
                    className="block w-full rounded-lg border-outline-variant bg-on-surface/[0.02] text-xs py-2 px-3 focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary text-primary"
                  />
                  <button
                    onClick={handleApplyDiscount}
                    id="apply-discount-btn"
                    disabled={discountLoading || !discountCode.trim() || !cartId}
                    className="bg-on-surface/5 text-on-surface px-4 py-2 rounded-lg text-xs font-semibold hover:bg-on-surface/10 transition-colors disabled:opacity-50"
                  >
                    {discountLoading ? "…" : "Apply"}
                  </button>
                </div>
                {discountError && (
                  <p className="text-xs text-red-500 mt-2">{discountError}</p>
                )}
                {discountSuccess && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    {discountSuccess}
                  </p>
                )}
                {appliedPromos.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {appliedPromos.map((p) => (
                      <li
                        key={p.id}
                        className="text-xs text-green-700 flex items-center justify-between gap-2"
                      >
                        <span className="font-semibold tracking-wide">
                          {p.code ?? "Promotion"}
                        </span>
                        {p.code && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDiscount(p.code!)}
                            className="underline text-on-surface-variant hover:text-on-surface"
                            disabled={discountLoading}
                          >
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Totals Breakdown */}
              <dl className="space-y-3 text-sm border-t border-outline-variant pt-6 mb-8">
                <div className="flex items-center justify-between text-on-surface-variant">
                  <dt>Subtotal</dt>
                  <dd className="font-medium text-on-surface">{fmt(subtotalVal, currencyCode)}</dd>
                </div>
                <div className="flex items-center justify-between text-on-surface-variant">
                  <dt>
                    {fulfillment === "delivery" && (cart?.shipping_total ?? 0) <= 0
                      ? "Est. delivery"
                      : "Fulfillment"}
                  </dt>
                  <dd className="font-medium text-on-surface">
                    {shippingVal === 0 ? "FREE" : fmt(shippingVal, currencyCode)}
                  </dd>
                </div>
                <div className="flex items-center justify-between text-on-surface-variant">
                  <dt>Est. Taxes</dt>
                  <dd className="font-medium text-on-surface">{fmt(taxVal, currencyCode)}</dd>
                </div>
                {discountVal > 0 && (
                  <div className="flex items-center justify-between text-green-600">
                    <dt>Discount</dt>
                    <dd className="font-medium">- {fmt(discountVal, currencyCode)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-outline-variant pt-4 mt-2">
                  <dt className="text-base font-bold text-on-surface">Total</dt>
                  <dd className="text-xl font-bold font-headline text-primary">{fmt(finalTotal, currencyCode)}</dd>
                </div>
              </dl>

              {/* Checkout button */}
              <button
                disabled={!canCheckout || isLoading}
                onClick={() => router.push("/checkout-page")}
                id="proceed-to-checkout-btn"
                className={`w-full py-4 px-4 rounded-lg text-sm font-bold shadow-lg transition-all duration-300 flex items-center justify-center gap-2 group ${
                  canCheckout && !isLoading
                    ? "bg-[#4a154b] text-white shadow-primary/20 hover:bg-[#3A103B] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">lock</span>
                Proceed to Checkout
              </button>

              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-[10px] text-on-surface-variant/80 flex items-center">
                  <span className="material-symbols-outlined text-[12px] mr-1">verified_user</span> Guaranteed safe & secure checkout
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
