"use client"

/**
 * PayPalProvider.tsx
 *
 * Loads the PayPal JS SDK for Smart Buttons (popup) — the only storefront
 * PayPal product path. Backend create-order must stay in Smart Buttons mode
 * (see apps/backend/src/modules/paypal/order-contract.ts).
 *
 * When NEXT_PUBLIC_PAYPAL_CLIENT_ID is unset, children render without the
 * script; `isPayPalConfigured` hides the PayPal payment option.
 */

import type { ReactNode } from "react"
import { PayPalScriptProvider } from "@paypal/react-paypal-js"

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""

export const isPayPalConfigured = PAYPAL_CLIENT_ID.length > 0

export default function PayPalProvider({ children }: { children: ReactNode }) {
  if (!isPayPalConfigured) {
    return <>{children}</>
  }

  return (
    <PayPalScriptProvider
      options={{
        clientId: PAYPAL_CLIENT_ID,
        currency: "GBP",
        intent: "capture",
        components: "buttons",
        // Pay Later ("Pay in 3" / "Pay in 30 Days") messaging renders inside
        // the same buttons but its eligibility check hangs the primary
        // button's spinner indefinitely on accounts (like sandbox GB) that
        // aren't fully provisioned for installments. Cake Break doesn't offer
        // Pay Later, so disable it outright rather than risk buyers getting
        // stuck at "processing" forever.
        disableFunding: "paylater",
      }}
    >
      {children}
    </PayPalScriptProvider>
  )
}
