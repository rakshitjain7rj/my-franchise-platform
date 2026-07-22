"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useCart } from "@/lib/cart/cart-context"
import { completeCartOrder } from "@/lib/cart/cart-actions"
import Header from "../../components/Header"
import Footer from "../../components/Footer"

const COMPLETE_TIMEOUT_MS = 45_000
const CART_ID_STORAGE_KEY = "medusa_cart_id"

function completeWithTimeout(cartId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    completeCartOrder(cartId),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "Order confirmation is taking too long. Your PayPal payment may still have completed; do not pay again. Please contact us with your PayPal receipt."
            )
          ),
        COMPLETE_TIMEOUT_MS
      )
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export default function PayPalReturnPage() {
  const { cartId, isLoading, clearCart } = useCart()
  const started = useRef(false)
  const [state, setState] = useState<"loading" | "success" | "error">("loading")
  const [orderNumber, setOrderNumber] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Gate completion until after mount so we never read localStorage during
  // render (server vs client mismatch → React #418).
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  useEffect(() => {
    if (!hasMounted || isLoading || started.current) return

    // Prefer the hydrated cart context id; fall back to same-tab storage only
    // after mount and after CartProvider has finished its hydrate pass.
    const checkoutCartId =
      cartId ?? window.localStorage.getItem(CART_ID_STORAGE_KEY)

    if (!checkoutCartId) {
      setState("error")
      setError(
        "We could not find this checkout. Your PayPal payment has not been charged again."
      )
      return
    }

    started.current = true
    void completeWithTimeout(checkoutCartId)
      .then((order) => {
        clearCart()
        setOrderNumber(order.display_id)
        setState("success")
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "We could not confirm your order."
        )
        setState("error")
      })
  }, [hasMounted, cartId, clearCart, isLoading])

  return (
    <div className="flex min-h-screen flex-col bg-[#EEDFF5]">
      <Header />
      <main className="flex flex-1 items-center justify-center px-6 py-28">
        <section className="w-full max-w-md rounded-lg border border-outline-variant bg-white p-8 text-center shadow-sm">
          {state === "loading" && (
            <>
              <span className="material-symbols-outlined animate-spin text-[40px] text-[#4A154B]">
                sync
              </span>
              <h1 className="mt-4 text-2xl font-bold text-[#4A154B]">
                Confirming your payment
              </h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                Please keep this page open while we finalise your order.
              </p>
            </>
          )}
          {state === "success" && (
            <>
              <span className="material-symbols-outlined text-[48px] text-green-600">
                check_circle
              </span>
              <h1 className="mt-4 text-2xl font-bold text-[#4A154B]">
                Order confirmed
              </h1>
              {orderNumber != null && (
                <p className="mt-2 text-sm font-bold text-[#4A154B]">
                  Order #{orderNumber}
                </p>
              )}
              <p className="mt-3 text-sm text-on-surface-variant">
                Thank you. Your payment and order have been received.
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#4A154B] px-4 py-3 text-sm font-bold text-white"
              >
                Back to storefront
              </Link>
            </>
          )}
          {state === "error" && (
            <>
              <span className="material-symbols-outlined text-[48px] text-red-500">
                error
              </span>
              <h1 className="mt-4 text-2xl font-bold text-[#4A154B]">
                We need to confirm your order
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                {error}
              </p>
              <Link
                href="/checkout-page"
                className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#4A154B] px-4 py-3 text-sm font-bold text-white"
              >
                Return to checkout
              </Link>
            </>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}
