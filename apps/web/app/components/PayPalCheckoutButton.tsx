"use client"

/**
 * PayPalCheckoutButton.tsx
 *
 * Renders the PayPal smart buttons for a cart whose details and shipping
 * method have already been saved (via prepareCartForCheckout) and whose
 * payment collection already exists.
 *
 * Product path: Smart Buttons (popup) only. Server create-order must return
 * a CREATED PayPal order — see backend `order-contract.ts`. This component
 * never mounts buttons until the SDK script is resolved, and rejects
 * redirect-mode sessions (PAYER_ACTION_REQUIRED) instead of hanging.
 *
 * Flow:
 *   createOrder — init pp_paypal_paypal session → return PayPal order id
 *   onApprove   — complete Medusa cart (captures PayPal) → onSuccess
 *   onCancel    — buyer closed popup; session stays retryable
 *   onError     — SDK / createOrder failure → parent error panel
 *
 * Stability contract (do not regress):
 *   createOrder / onApprove handlers MUST keep a stable identity across
 *   re-renders (refs + useCallback). If the parent remounts these buttons
 *   while the PayPal popup is open, the popup↔opener bridge dies: PayPal
 *   still marks the order APPROVED, but onApprove never runs, complete is
 *   never called, and the buyer stares at an infinite "Pay Now" spinner.
 */

import { useCallback, useRef, useState } from "react"
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js"
import {
  completeCartOrder,
  extractSmartButtonsOrderId,
  initPaymentSession,
  PAYPAL_PROVIDER_ID,
  type MedusaOrder,
} from "@/lib/cart/cart-actions"

/** Hard ceiling so a hung /complete never leaves the PayPal popup spinning. */
const COMPLETE_TIMEOUT_MS = 45_000

interface PayPalCheckoutButtonProps {
  cartId: string
  paymentCollectionId: string
  disabled?: boolean
  onSuccess: (order: MedusaOrder) => void
  onError: (err: Error) => void
  onCancel: () => void
  /** Fired when the PayPal popup opens / closes so the parent can freeze UI. */
  onPopupStateChange?: (open: boolean) => void
}

async function completeWithTimeout(
  cartId: string,
  timeoutMs: number
): Promise<MedusaOrder> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      completeCartOrder(cartId),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              "Finalising your order is taking too long. If PayPal shows the payment as complete, please contact us with your PayPal receipt — do not pay again."
            )
          )
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export default function PayPalCheckoutButton({
  cartId,
  paymentCollectionId,
  disabled = false,
  onSuccess,
  onError,
  onCancel,
  onPopupStateChange,
}: PayPalCheckoutButtonProps) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer()
  const completingRef = useRef(false)
  const [completing, setCompleting] = useState(false)

  // Keep latest props in refs so createOrder/onApprove stay referentially
  // stable — unstable handlers make PayPalButtons re-init and break an open
  // popup's postMessage bridge (infinite Pay Now spinner).
  const cartIdRef = useRef(cartId)
  cartIdRef.current = cartId
  const collectionIdRef = useRef(paymentCollectionId)
  collectionIdRef.current = paymentCollectionId
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const onPopupStateChangeRef = useRef(onPopupStateChange)
  onPopupStateChangeRef.current = onPopupStateChange

  const handleCreateOrder = useCallback(async (): Promise<string> => {
    const session = await initPaymentSession(
      collectionIdRef.current,
      PAYPAL_PROVIDER_ID
    )
    return extractSmartButtonsOrderId(session)
  }, [])

  const handleApprove = useCallback(async (_data: { orderID?: string }): Promise<void> => {
    if (completingRef.current) return
    completingRef.current = true
    setCompleting(true)
    try {
      // Keep the popup bridge mounted until this promise resolves. PayPal has
      // approved the wallet payment, but it is still waiting for this
      // callback to finish. Clearing popup state here would make the parent
      // unmount PayPalButtons and strand the popup on its loading spinner.
      // Capture + place order server-side; Medusa authorizePayment calls
      // Orders.capture for the approved PayPal order.
      const order = await completeWithTimeout(
        cartIdRef.current,
        COMPLETE_TIMEOUT_MS
      )
      onSuccessRef.current(order)
    } catch (err) {
      // Payment may already be taken on PayPal — allow retry of cart complete.
      completingRef.current = false
      onErrorRef.current(
        err instanceof Error
          ? err
          : new Error("We could not finalise your order. Please try again.")
      )
    } finally {
      setCompleting(false)
    }
  }, [])

  const handleCancel = useCallback(() => {
    onPopupStateChangeRef.current?.(false)
    if (!completingRef.current) onCancelRef.current()
  }, [])

  const handleError = useCallback((err: Record<string, unknown>) => {
    onPopupStateChangeRef.current?.(false)
    if (completingRef.current) return
    onErrorRef.current(
      err instanceof Error
        ? err
        : new Error("PayPal could not process the payment. Please try again.")
    )
  }, [])

  const handleClick = useCallback(async () => {
    // Signal parent before the popup opens so it freezes invalidation effects
    // that would remount these buttons mid-checkout.
    onPopupStateChangeRef.current?.(true)
  }, [])

  if (isRejected) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
        <p className="text-xs text-red-700 font-semibold leading-relaxed">
          The PayPal checkout failed to load. Please refresh the page or choose
          a different payment method.
        </p>
      </div>
    )
  }

  // Mount buttons only after the SDK script resolves — avoids a second
  // perpetual spinner and early-mount races with the script loader.
  if (isPending) {
    return (
      <div className="space-y-2 animate-pulse" aria-hidden="true">
        <div className="h-11 bg-on-surface/10 rounded-lg"></div>
        <div className="h-11 bg-on-surface/5 rounded-lg"></div>
      </div>
    )
  }

  return (
    <div className="relative">
      {completing && (
        <div className="mb-3 flex items-center justify-center gap-2 text-xs font-semibold text-[#4A154B]">
          <span className="animate-spin material-symbols-outlined text-[16px]">
            sync
          </span>
          Finalising your order…
        </div>
      )}
      <PayPalButtons
        style={{
          layout: "vertical",
          color: "blue",
          shape: "rect",
          label: "paypal",
        }}
        // Only re-init when the payment collection changes — not on every
        // parent render (which was severing open popups).
        forceReRender={[paymentCollectionId]}
        disabled={disabled || completing}
        createOrder={handleCreateOrder}
        onApprove={handleApprove}
        onCancel={handleCancel}
        onError={handleError}
        onClick={handleClick}
      />
    </div>
  )
}
