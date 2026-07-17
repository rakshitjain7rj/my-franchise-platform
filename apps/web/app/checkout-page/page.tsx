"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCart } from "@/lib/cart/cart-context"
import {
  createPaymentCollection,
  extractPaypalRedirectUrl,
  initPaymentSession,
  placeOrder,
  prepareCartForCheckout,
  PAYPAL_PROVIDER_ID,
} from "@/lib/cart/cart-actions"
import { getCurrentCustomer } from "@/lib/auth/auth-actions"
import {
  getCustomerAddresses,
  type Address,
} from "@/lib/auth/account-actions"
import {
  isHiddenAttrKey,
  labelForAttrKey,
} from "@/types/cake-metadata"
import { getBrowserCookie, STORE_ID_COOKIE } from "@/lib/store-cookies"
import Header from "../components/Header"
import Footer from "../components/Footer"
import { isPayPalConfigured } from "../components/PayPalProvider"
import { Playfair_Display } from "next/font/google"

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-playfair",
})

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency?.toUpperCase() ?? "GBP",
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function CheckoutPage() {
  const { cart, isLoading, clearCart, checkInventory } = useCart()
  const router = useRouter()

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    apartment: "",
    city: "",
    postalCode: "",
    notes: "",
    offers: true,
  })

  // Saved address book + which entry is applied to the shipping form.
  // Selecting an entry overwrites recipient fields so gift/family addresses work.
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | "custom" | null>(
    null
  )
  const [prefillDone, setPrefillDone] = useState(false)

  const markCustomAddress = () => {
    setSelectedAddressId((cur) => (cur && cur !== "custom" ? "custom" : cur))
  }

  const handleSelectSavedAddress = (id: string) => {
    if (id === "custom") {
      setSelectedAddressId("custom")
      return
    }
    const addr = savedAddresses.find((a) => a.id === id)
    if (!addr) return
    setSelectedAddressId(id)
    // Intentional overwrite — shopper chose a different recipient/address.
    setForm((prev) => ({
      ...prev,
      firstName: addr.first_name?.trim() || prev.firstName,
      lastName: addr.last_name?.trim() || prev.lastName,
      phone: addr.phone?.trim() || prev.phone,
      address: addr.address_1?.trim() || "",
      apartment: addr.address_2?.trim() || "",
      city: addr.city?.trim() || "",
      postalCode: addr.postal_code?.trim() || "",
    }))
  }

  // Pre-fill contact + address for returning shoppers.
  // Shipping recipient fields prefer the address book (so "Mum" addresses win
  // over the account holder's own name). Email always comes from the account.
  useEffect(() => {
    let cancelled = false

    const pick = (
      current: string,
      ...candidates: Array<string | null | undefined>
    ) => {
      if (current.trim()) return current
      for (const c of candidates) {
        if (typeof c === "string" && c.trim()) return c
      }
      return current
    }

    const autofillCustomerDetails = async () => {
      const [customer, addresses] = await Promise.all([
        getCurrentCustomer().catch(() => null),
        getCustomerAddresses().catch(() => []),
      ])
      if (cancelled) return

      setSavedAddresses(addresses)

      const saved =
        addresses.find((a) => a.is_default_shipping) ??
        addresses.find((a) => a.is_default_billing) ??
        addresses[0] ??
        null
      const cartAddr = cart?.shipping_address

      // Prefer cart shipping when present (mid-checkout resume), else default
      // address book entry. Profile fills only gaps (especially email).
      setForm((prev) => ({
        ...prev,
        // Recipient name: cart → saved address → profile
        firstName: pick(
          prev.firstName,
          cartAddr?.first_name,
          saved?.first_name,
          customer?.first_name
        ),
        lastName: pick(
          prev.lastName,
          cartAddr?.last_name,
          saved?.last_name,
          customer?.last_name
        ),
        email: pick(prev.email, cart?.email, customer?.email),
        phone: pick(
          prev.phone,
          cartAddr?.phone,
          saved?.phone,
          customer?.phone
        ),
        address: pick(prev.address, cartAddr?.address_1, saved?.address_1),
        apartment: pick(prev.apartment, cartAddr?.address_2, saved?.address_2),
        city: pick(prev.city, cartAddr?.city, saved?.city),
        postalCode: pick(
          prev.postalCode,
          cartAddr?.postal_code,
          saved?.postal_code
        ),
      }))

      if (!prefillDone) {
        setSelectedAddressId(saved?.id ?? (customer ? "custom" : null))
        setPrefillDone(true)
      }
    }

    void autofillCustomerDetails()
    return () => {
      cancelled = true
    }
    // Re-run when cart hydrates so we can apply cart.email / shipping_address.
  }, [cart?.id, cart?.email, cart?.shipping_address, prefillDone])

  const [card, setCard] = useState({
    number: "",
    name: "",
    expiry: "",
    cvv: "",
  })

  const [paymentMethod, setPaymentMethod] = useState("card")
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState<number | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)

  const totalItems = cart?.items.reduce((a, i) => a + i.quantity, 0) ?? 0

  // Guard: verify the selected bakery can actually fulfill the cart. The cart
  // page blocks checkout too, but the header links straight here, so this page
  // must not rely on the shopper having passed through /cart after switching
  // stores. `true` = blocked.
  const [inventoryBlocked, setInventoryBlocked] = useState(false)
  const itemsSignature = cart?.items?.map((i) => `${i.id}-${i.quantity}`).join(",") ?? ""

  useEffect(() => {
    const storeLocationId = getBrowserCookie(STORE_ID_COOKIE)
    if (!cart?.id || !storeLocationId || !cart.items.length) {
      setInventoryBlocked(false)
      return
    }
    let active = true
    checkInventory(storeLocationId)
      .then((res) => {
        if (active && res) setInventoryBlocked(!res.all_sufficient)
      })
      .catch(() => { })
    return () => {
      active = false
    }
  }, [cart?.id, itemsSignature, checkInventory])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cart || cart.items.length === 0) {
      setSubmitError("Your cart is empty — add a cake before checking out.")
      return
    }
    if (inventoryBlocked) {
      setSubmitError(
        "Some items in your cart aren't available at your selected bakery. Please review your cart before placing the order."
      )
      return
    }

    const details = {
      email: form.email,
      phone: form.phone,
      first_name: form.firstName,
      last_name: form.lastName,
      address_1: form.address,
      address_2: form.apartment,
      city: form.city,
      postal_code: form.postalCode,
      notes: form.notes,
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      if (paymentMethod === "paypal") {
        // One full-page handoff. Do not mount Smart Buttons here: their extra
        // funding-source step and popup bridge were the source of recurring
        // loading hangs. Redirect mode always returns to paypal-return.
        await prepareCartForCheckout(cart.id, details)
        const collection = await createPaymentCollection(cart.id)
        const session = await initPaymentSession(collection.id, PAYPAL_PROVIDER_ID)
        window.location.assign(extractPaypalRedirectUrl(session))
        return
      } else {
        // Card / pay-on-collection — single-shot via the system provider.
        const order = await placeOrder(cart.id, details)
        setOrderNumber(order.display_id)
        setSubmitted(true)
        clearCart()
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "We could not place your order. Please try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  const subtotalVal = cart?.subtotal ?? 0
  const taxVal = cart?.tax_total ?? 0
  const discountVal = cart?.discount_total ?? 0
  // Shipping: prefer Medusa shipping_total; else cart metadata delivery_fee
  // from the backend logistics quote (never hardcode a client-side constant).
  const isDelivery = cart?.metadata?.fulfillment_method === "delivery"
  const quotedDeliveryFee =
    typeof cart?.metadata?.delivery_fee === "number"
      ? Number(cart.metadata.delivery_fee)
      : 0
  const shippingVal = cart
    ? cart.shipping_total > 0
      ? cart.shipping_total
      : isDelivery
        ? quotedDeliveryFee
        : 0
    : 0
  const finalTotal = Math.max(
    0,
    (cart?.total ?? 0) + (cart && cart.shipping_total <= 0 ? shippingVal : 0)
  )
  const currencyCode = cart?.currency_code ?? "GBP"
  const slotLabel =
    (typeof cart?.metadata?.requested_pickup_label === "string" &&
      cart.metadata.requested_pickup_label) ||
    (typeof cart?.metadata?.requested_pickup_time === "string" &&
      cart.metadata.requested_pickup_time) ||
    null
  const slotDate =
    typeof cart?.metadata?.requested_pickup_date === "string"
      ? cart.metadata.requested_pickup_date
      : null

  if (submitted) {
    return (
      <div className={`flex flex-col min-h-screen ${playfair.variable}`}>
        <Header />
        <main className="flex-grow bg-[#EEDFF5] flex items-center justify-center py-16 px-6">
          <div className="bg-white rounded-xl shadow-lg border border-outline-variant p-8 text-center space-y-6 max-w-md w-full">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <span className="material-symbols-outlined !text-[44px] text-green-600">
                check_circle
              </span>
            </div>
            <h1 className={`text-3xl font-bold text-[#4A154B] ${playfair.className}`}>
              Order Confirmed!
            </h1>
            {orderNumber != null && (
              <p className="text-sm font-bold text-[#4A154B] tracking-widest uppercase">
                Order #{orderNumber}
              </p>
            )}
            <p className="text-on-surface-variant text-sm leading-relaxed">
              Thank you, <strong className="text-on-surface">{form.firstName}</strong>. Your order has been placed with the bakery — please quote your order number when you collect.
            </p>
            <div className="bg-[#EEDFF5]/20 rounded-lg p-4 border border-outline-variant/30 text-left space-y-2">
              <p className="text-xs text-on-surface-variant">
                <strong>Delivery Address:</strong> {form.address}, {form.apartment && `${form.apartment}, `}{form.city}, {form.postalCode}
              </p>
              {form.notes && (
                <p className="text-xs text-on-surface-variant">
                  <strong>Notes for Bakers:</strong> &ldquo;{form.notes}&rdquo;
                </p>
              )}
            </div>
            <Link
              href="/"
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-lg bg-[#4A154B] text-white font-bold text-sm uppercase tracking-wider hover:bg-[#3A103B] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 shadow-md shadow-[#4A154B]/10"
            >
              <span className="material-symbols-outlined !text-[18px]">home</span>
              Back to Storefront
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className={`flex flex-col min-h-screen ${playfair.variable}`}>
        <Header />
        <main className="flex-grow pt-20 sm:pt-28 pb-20 md:pb-16 bg-[#EEDFF5] w-full">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-6 sm:mb-10">
              <h1 className={`text-2xl sm:text-3xl font-bold text-[#4A154B] mb-2 ${playfair.className}`}>Secure Checkout</h1>
              <div className="flex items-center text-sm text-on-surface-variant">
                <span className="relative flex h-2 w-2 mr-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live secure connection
              </div>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
              {/* Left Column: Form Sections */}
              <div className="lg:col-span-7 space-y-4 sm:space-y-6">
                <div className="bg-white rounded-lg shadow-sm border border-outline-variant overflow-hidden">

                  {/* Contact Information */}
                  <section className="p-4 sm:p-6">
                    <h2 className={`text-lg font-semibold text-[#4A154B] mb-5 flex items-center ${playfair.className}`}>
                      <span className="material-symbols-outlined mr-2 text-[#4A154B]/80 text-[20px]">contact_mail</span>
                      Contact Information
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider" htmlFor="email">
                          Email address
                        </label>
                        <input
                          required
                          id="email"
                          name="email"
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          className="block w-full rounded-lg border border-outline-variant bg-on-surface/[0.02] text-sm py-2.5 px-3 transition-all focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider" htmlFor="phone">
                          Phone number
                        </label>
                        <input
                          required
                          id="phone"
                          name="phone"
                          type="tel"
                          value={form.phone}
                          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                          className="block w-full rounded-lg border border-outline-variant bg-on-surface/[0.02] text-sm py-2.5 px-3 transition-all focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                        />
                      </div>
                      <div className="flex items-center">
                        <input
                          id="offers"
                          name="offers"
                          type="checkbox"
                          checked={form.offers}
                          onChange={(e) => setForm((f) => ({ ...f, offers: e.target.checked }))}
                          className="h-4 w-4 rounded border-outline-variant text-[#4A154B] focus:ring-[#4A154B]/20 transition-all cursor-pointer"
                        />
                        <label className="ml-2.5 block text-sm text-on-surface-variant cursor-pointer select-none" htmlFor="offers">
                          Email me with news and exclusive offers
                        </label>
                      </div>
                    </div>
                  </section>

                  <div className="border-t border-outline-variant"></div>

                  {/* Delivery Details */}
                  <section className="p-4 sm:p-6">
                    <h2 className={`text-lg font-semibold text-[#4A154B] mb-5 flex items-center ${playfair.className}`}>
                      <span className="material-symbols-outlined mr-2 text-[#4A154B]/80 text-[20px]">local_shipping</span>
                      Delivery Details
                    </h2>

                    {savedAddresses.length > 0 && (
                      <div className="mb-5">
                        <label
                          className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
                          htmlFor="saved-address"
                        >
                          Ship to saved address
                        </label>
                        <select
                          id="saved-address"
                          value={selectedAddressId ?? "custom"}
                          onChange={(e) => handleSelectSavedAddress(e.target.value)}
                          className="block w-full rounded-lg border border-outline-variant bg-on-surface/[0.02] text-sm py-2.5 px-3 transition-all focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                        >
                          {savedAddresses.map((a) => {
                            const recipient = [a.first_name, a.last_name]
                              .filter(Boolean)
                              .join(" ")
                            const label =
                              a.address_name?.trim() ||
                              recipient ||
                              a.address_1 ||
                              "Saved address"
                            const meta = [
                              recipient && a.address_name ? recipient : null,
                              a.postal_code?.toUpperCase(),
                              a.is_default_shipping ? "Default" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                            return (
                              <option key={a.id} value={a.id}>
                                {label}
                                {meta ? ` — ${meta}` : ""}
                              </option>
                            )
                          })}
                          <option value="custom">Enter a different address…</option>
                        </select>
                        <p className="mt-1.5 text-[11px] text-on-surface-variant">
                          Choosing a saved address fills recipient name and street
                          details. Edit any field below if needed.
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider" htmlFor="first-name">
                          Recipient first name
                        </label>
                        <input
                          required
                          id="first-name"
                          name="first-name"
                          type="text"
                          value={form.firstName}
                          onChange={(e) => {
                            markCustomAddress()
                            setForm((f) => ({ ...f, firstName: e.target.value }))
                          }}
                          className="block w-full rounded-lg border border-outline-variant bg-on-surface/[0.02] text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider" htmlFor="last-name">
                          Recipient last name
                        </label>
                        <input
                          required
                          id="last-name"
                          name="last-name"
                          type="text"
                          value={form.lastName}
                          onChange={(e) => {
                            markCustomAddress()
                            setForm((f) => ({ ...f, lastName: e.target.value }))
                          }}
                          className="block w-full rounded-lg border border-outline-variant bg-on-surface/[0.02] text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider" htmlFor="address">
                          Address
                        </label>
                        <input
                          required
                          id="address"
                          name="address"
                          type="text"
                          value={form.address}
                          onChange={(e) => {
                            markCustomAddress()
                            setForm((f) => ({ ...f, address: e.target.value }))
                          }}
                          className="block w-full rounded-lg border border-outline-variant bg-on-surface/[0.02] text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider" htmlFor="apartment">
                          Apartment, suite, etc. (optional)
                        </label>
                        <input
                          id="apartment"
                          name="apartment"
                          type="text"
                          value={form.apartment}
                          onChange={(e) => {
                            markCustomAddress()
                            setForm((f) => ({ ...f, apartment: e.target.value }))
                          }}
                          className="block w-full rounded-lg border border-outline-variant bg-on-surface/[0.02] text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider" htmlFor="city">
                          City
                        </label>
                        <input
                          required
                          id="city"
                          name="city"
                          type="text"
                          value={form.city}
                          onChange={(e) => {
                            markCustomAddress()
                            setForm((f) => ({ ...f, city: e.target.value }))
                          }}
                          className="block w-full rounded-lg border border-outline-variant bg-on-surface/[0.02] text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider" htmlFor="postal-code">
                          Postal code
                        </label>
                        <input
                          required
                          id="postal-code"
                          name="postal-code"
                          type="text"
                          value={form.postalCode}
                          onChange={(e) => {
                            markCustomAddress()
                            setForm((f) => ({ ...f, postalCode: e.target.value }))
                          }}
                          className="block w-full rounded-lg border border-outline-variant bg-on-surface/[0.02] text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                        />
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] text-on-surface-variant">
                      Recipient name can differ from your account (e.g. delivering to a parent).
                      Contact email above stays yours for order updates.
                    </p>
                  </section>

                  <div className="border-t border-outline-variant"></div>

                  {/* Payment Method */}
                  <section className="p-4 sm:p-6">
                    <h2 className={`text-lg font-semibold text-[#4A154B] mb-1 flex items-center ${playfair.className}`}>
                      <span className="material-symbols-outlined mr-2 text-[#4A154B]/80 text-[20px]">payment</span>
                      Payment Method
                    </h2>
                    <p className="text-xs text-on-surface-variant mb-5">Securely encrypted payment processing.</p>

                    <div className="space-y-3">
                      {/* Credit Card Option */}
                      <div
                        onClick={() => setPaymentMethod("card")}
                        className={`border rounded-lg p-4 transition-all cursor-pointer ${paymentMethod === "card"
                            ? "border-[#4A154B] bg-[#4A154B]/[0.02]"
                            : "border-outline-variant hover:border-secondary"
                          }`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center">
                            <input
                              type="radio"
                              id="payment-card"
                              name="payment-method"
                              checked={paymentMethod === "card"}
                              onChange={() => setPaymentMethod("card")}
                              className="h-4 w-4 text-[#4A154B] focus:ring-[#4A154B]/20 cursor-pointer"
                            />
                            <label className="ml-3 block text-sm font-medium text-[#4A154B] cursor-pointer select-none" htmlFor="payment-card">
                              Credit / Debit Card
                            </label>
                          </div>
                          <div className="flex space-x-1.5">
                            <span className="h-5 w-8 bg-on-surface/5 rounded flex items-center justify-center text-[8px] font-bold text-on-surface-variant">VISA</span>
                            <span className="h-5 w-8 bg-on-surface/5 rounded flex items-center justify-center text-[8px] font-bold text-on-surface-variant">MC</span>
                          </div>
                        </div>

                        {paymentMethod === "card" && (
                          <div className="grid grid-cols-4 gap-3 animate-in fade-in duration-200">
                            <div className="col-span-4">
                              <input
                                required={paymentMethod === "card"}
                                type="text"
                                placeholder="Card number"
                                value={card.number}
                                onChange={(e) => setCard((c) => ({ ...c, number: e.target.value }))}
                                className="block w-full rounded-lg border border-outline-variant bg-white text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                              />
                            </div>
                            <div className="col-span-4">
                              <input
                                required={paymentMethod === "card"}
                                type="text"
                                placeholder="Name on card"
                                value={card.name}
                                onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))}
                                className="block w-full rounded-lg border border-outline-variant bg-white text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                              />
                            </div>
                            <div className="col-span-2">
                              <input
                                required={paymentMethod === "card"}
                                type="text"
                                placeholder="Exp (MM / YY)"
                                value={card.expiry}
                                onChange={(e) => setCard((c) => ({ ...c, expiry: e.target.value }))}
                                className="block w-full rounded-lg border border-outline-variant bg-white text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                              />
                            </div>
                            <div className="col-span-2">
                              <input
                                required={paymentMethod === "card"}
                                type="password"
                                placeholder="CVV"
                                maxLength={4}
                                value={card.cvv}
                                onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value }))}
                                className="block w-full rounded-lg border border-outline-variant bg-white text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B]"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* PayPal Option — hidden when NEXT_PUBLIC_PAYPAL_CLIENT_ID
                        is not configured, since the buttons could never load. */}
                      {isPayPalConfigured && (
                        <div
                          onClick={() => setPaymentMethod("paypal")}
                          className={`border rounded-lg p-4 transition-all cursor-pointer ${paymentMethod === "paypal"
                              ? "border-[#4A154B] bg-[#4A154B]/[0.02]"
                              : "border-outline-variant hover:border-secondary"
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <input
                                type="radio"
                                id="payment-paypal"
                                name="payment-method"
                                checked={paymentMethod === "paypal"}
                                onChange={() => setPaymentMethod("paypal")}
                                className="h-4 w-4 text-[#4A154B] focus:ring-[#4A154B]/20 cursor-pointer"
                              />
                              <label className="ml-3 block text-sm font-medium text-on-surface cursor-pointer select-none" htmlFor="payment-paypal">
                                PayPal
                              </label>
                            </div>
                            <span className="h-5 px-2 bg-[#003087] text-white rounded flex items-center text-[9px] font-bold italic">PayPal</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  <div className="border-t border-outline-variant"></div>

                  {/* Special Notes */}
                  <section className="p-4 sm:p-6">
                    <h2 className={`text-lg font-semibold text-[#4A154B] mb-5 flex items-center ${playfair.className}`}>
                      <span className="material-symbols-outlined mr-2 text-[#4A154B]/80 text-[20px]">edit_note</span>
                      Special Notes
                    </h2>
                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider" htmlFor="notes">
                        Special requests or allergy details (optional)
                      </label>
                      <textarea
                        id="notes"
                        name="notes"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        rows={3}
                        className="block w-full rounded-lg border border-outline-variant bg-on-surface/[0.02] text-sm py-2.5 px-3 transition-all focus:outline-none focus:ring-2 focus:ring-[#4A154B]/20 focus:border-[#4A154B] resize-none"
                        placeholder="Any specific instructions, dietary preferences, or custom cake details..."
                      />
                    </div>
                  </section>

                </div>
              </div>

              {/* Right Column: Order Summary */}
              <div className="lg:col-span-5">
                {/* Mobile accordion toggle — only visible below lg */}
                <button
                  type="button"
                  onClick={() => setSummaryOpen((v) => !v)}
                  className="lg:hidden w-full flex items-center justify-between bg-white rounded-lg shadow-sm border border-outline-variant p-4 text-sm font-semibold text-[#4A154B] mb-2"
                  aria-expanded={summaryOpen}
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[18px]">receipt_long</span>
                    Order Summary
                  </span>
                  <span className={`material-symbols-outlined !text-[20px] transition-transform duration-200 ${summaryOpen ? "rotate-180" : ""}`}>expand_more</span>
                </button>
                <div className={`bg-white rounded-lg shadow-sm border border-outline-variant p-4 sm:p-6 lg:sticky lg:top-24 ${summaryOpen ? "block" : "hidden lg:block"}`}>
                  <h2 className={`text-lg font-semibold text-[#4A154B] mb-6 ${playfair.className}`}>Order Summary</h2>

                  {isLoading ? (
                    <div className="space-y-4 animate-pulse mb-6">
                      <div className="h-16 bg-on-surface/5 rounded-lg"></div>
                      <div className="h-16 bg-on-surface/5 rounded-lg"></div>
                    </div>
                  ) : (
                    <ul className="space-y-4 mb-6">
                      {cart?.items.map((item) => {
                        const meta = item.metadata as Record<string, unknown> | null
                        const customAttrs = meta?.custom_attributes as
                          | Record<string, string>
                          | undefined
                        const inscription = meta?.inscription as string | undefined

                        return (
                          <li key={item.id} className="flex items-center">
                            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-on-surface/5 relative">
                              {item.thumbnail ? (
                                <img
                                  alt={item.title}
                                  className="h-full w-full object-cover"
                                  src={item.thumbnail}
                                />
                              ) : (
                                <span className="material-symbols-outlined !text-[24px] text-[#4A154B]/20 flex items-center justify-center h-full w-full">
                                  cake
                                </span>
                              )}
                              <span className="absolute -top-1 -right-1 bg-[#4A154B] text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                                {item.quantity}
                              </span>
                            </div>
                            <div className="ml-4 flex flex-1 flex-col">
                              <div className="flex justify-between text-sm font-medium text-on-surface">
                                <h3 className={playfair.className}>{item.title}</h3>
                                <p className="font-semibold">{fmt(item.unit_price * item.quantity, item.currency_code)}</p>
                              </div>
                              {customAttrs && Object.keys(customAttrs).length > 0 ? (
                                <p className="text-xs text-on-surface-variant mt-0.5">
                                  {Object.entries(customAttrs)
                                    .filter(([k, v]) => v && !isHiddenAttrKey(k))
                                    .map(([k, v]) => `${labelForAttrKey(k)}: ${v}`)
                                    .join(", ")}
                                </p>
                              ) : item.variant_title ? (
                                <p className="text-xs text-on-surface-variant mt-0.5">
                                  {item.variant_title}
                                </p>
                              ) : null}
                              {inscription && (
                                <p className="text-[10px] italic text-on-surface-variant/80 mt-0.5">
                                  &ldquo;{inscription}&rdquo;
                                </p>
                              )}
                            </div>
                          </li>
                        )
                      })}
                      {(!cart || cart.items.length === 0) && (
                        <li className="py-6 text-center">
                          <p className="text-sm text-on-surface-variant">
                            Your cart is empty.
                          </p>
                          <Link
                            href="/cake-catalogue"
                            className="mt-2 inline-block text-xs font-bold text-[#4A154B] uppercase tracking-widest hover:underline"
                          >
                            Browse the cake catalogue
                          </Link>
                        </li>
                      )}
                    </ul>
                  )}

                  {/* Discount codes are applied only on the cart page; show
                      the amount here when a promotion is already on the cart. */}

                  {/* Collection / delivery slot from cart logistics */}
                  {(slotDate || slotLabel) && (
                    <div className="mb-4 rounded-lg bg-[#EEDFF5]/40 border border-outline-variant/40 px-3 py-2.5 text-xs text-on-surface-variant">
                      <span className="font-semibold text-[#4A154B] uppercase tracking-wider text-[10px]">
                        {isDelivery ? "Delivery window" : "Collection slot"}
                      </span>
                      <p className="mt-0.5 text-sm text-on-surface font-medium">
                        {[slotDate, slotLabel].filter(Boolean).join(" · ")}
                      </p>
                      {isDelivery &&
                        typeof cart?.metadata?.delivery_postcode === "string" && (
                          <p className="mt-0.5">
                            To {String(cart.metadata.delivery_postcode)}
                            {typeof cart.metadata.delivery_distance_km === "number" &&
                              ` · ~${Number(cart.metadata.delivery_distance_km).toFixed(1)} km`}
                          </p>
                        )}
                    </div>
                  )}

                  {/* Pricing Breakdowns */}
                  <dl className="space-y-3 text-sm border-t border-outline-variant pt-6 mb-8">
                    <div className="flex items-center justify-between text-on-surface-variant">
                      <dt>Subtotal</dt>
                      <dd className="font-medium text-on-surface">
                        {fmt(subtotalVal, currencyCode)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-on-surface-variant">
                      <dt>{isDelivery ? "Local Delivery" : "Store Pickup"}</dt>
                      <dd className="font-medium text-on-surface">
                        {shippingVal > 0
                          ? fmt(shippingVal, currencyCode)
                          : isDelivery
                            ? "Quote on cart"
                            : "Free"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-on-surface-variant">
                      <dt>Est. Taxes</dt>
                      <dd className="font-medium text-on-surface">
                        {fmt(taxVal, currencyCode)}
                      </dd>
                    </div>
                    {discountVal > 0 && (
                      <div className="flex items-center justify-between text-green-600">
                        <dt>Discount</dt>
                        <dd className="font-medium">
                          -{fmt(discountVal, currencyCode)}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-outline-variant pt-4 mt-2">
                      <dt className="text-base font-bold text-on-surface">Total</dt>
                      <dd className={`text-xl font-bold text-[#4A154B] ${playfair.className}`}>
                        {fmt(finalTotal, currencyCode)}
                      </dd>
                    </div>
                  </dl>

                  {inventoryBlocked && (
                    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
                      <span className="material-symbols-outlined text-red-500 text-[18px] shrink-0">production_quantity_limits</span>
                      <p className="text-xs text-red-700 font-semibold leading-relaxed">
                        Some items aren&apos;t available at your selected bakery.{" "}
                        <Link href="/cart" className="underline hover:text-red-800">
                          Review your cart
                        </Link>{" "}
                        to adjust them or choose another bakery.
                      </p>
                    </div>
                  )}

                  {submitError && (
                    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
                      <span className="material-symbols-outlined text-red-500 text-[18px] shrink-0">error</span>
                      <p className="text-xs text-red-700 font-semibold leading-relaxed">{submitError}</p>
                    </div>
                  )}

                  <button
                      type="submit"
                      disabled={submitting || inventoryBlocked}
                      id="complete-order-btn"
                      className="w-full bg-[#4A154B] text-white py-4 px-4 rounded-lg text-sm font-bold shadow-lg shadow-[#4A154B]/20 hover:bg-[#3A103B] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-2 group disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <span className="animate-spin material-symbols-outlined text-[18px]">sync</span>
                          Processing...
                        </>
                      ) : paymentMethod === "paypal" ? (
                        <>
                          <span className="material-symbols-outlined text-[18px]">lock</span>
                          Continue to PayPal
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">lock</span>
                          Complete Order &amp; Pay
                        </>
                      )}
                  </button>

                  <div className="mt-4 flex flex-col items-center gap-2">
                    <p className="text-[10px] text-on-surface-variant/80 flex items-center">
                      <span className="material-symbols-outlined text-[14px] mr-1">verified_user</span>
                      Guaranteed safe &amp; secure checkout
                    </p>
                    <p className="text-[10px] text-on-surface-variant/60 text-center px-4">
                      By placing your order, you agree to Cake Break&apos;s Terms and Privacy Policy.
                    </p>
                  </div>

                </div>
              </div>
            </form>

          </div>
        </main>
        <Footer />
      </div>
  )
}
