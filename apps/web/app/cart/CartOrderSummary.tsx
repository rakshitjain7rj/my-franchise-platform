"use client"

import type { MedusaCartItem } from "@/lib/cart/cart-actions"
import { fmt } from "./format"

interface CartOrderSummaryProps {
  items: MedusaCartItem[]
  currencyCode: string
  cartId: string | null
  isLoading: boolean
  canCheckout: boolean
  onCheckout: () => void
  fulfillment: "pickup" | "delivery"
  shippingVal: number
  deliveryFee: number
  deliveryFeeError: string | null
  subtotalVal: number
  taxVal: number
  discountVal: number
  finalTotal: number
  appliedPromos: Array<{ id: string; code?: string | null }>
  discountCode: string
  onDiscountCodeChange: (value: string) => void
  discountLoading: boolean
  discountError: string | null
  discountSuccess: string | null
  onApplyDiscount: () => void
  onRemoveDiscount: (code: string) => void
  onClearDiscountMessages: () => void
}

export function CartOrderSummary({
  items,
  currencyCode,
  cartId,
  isLoading,
  canCheckout,
  onCheckout,
  fulfillment,
  shippingVal,
  deliveryFee,
  deliveryFeeError,
  subtotalVal,
  taxVal,
  discountVal,
  finalTotal,
  appliedPromos,
  discountCode,
  onDiscountCodeChange,
  discountLoading,
  discountError,
  discountSuccess,
  onApplyDiscount,
  onRemoveDiscount,
  onClearDiscountMessages,
}: CartOrderSummaryProps) {
  return (
    <div className="lg:sticky lg:top-24 bg-white rounded-lg shadow-sm border border-outline-variant p-4 sm:p-6">
      <h2 className="text-lg font-semibold font-headline text-primary mb-6">
        Order Summary
      </h2>

      <ul className="space-y-4 mb-6">
        {items.map((item) => {
          const meta = item.metadata as Record<string, unknown> | null
          const customAttrs = meta?.custom_attributes as
            | Record<string, string>
            | undefined
          return (
            <li key={item.id} className="flex items-center">
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-on-surface/5 relative">
                {item.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={item.title}
                    className="h-full w-full object-cover"
                    src={item.thumbnail}
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-on-surface/5">
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant/30">
                      cake
                    </span>
                  </div>
                )}
                <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {item.quantity}
                </span>
              </div>
              <div className="ml-4 flex flex-1 flex-col">
                <div className="flex justify-between text-sm font-medium text-on-surface">
                  <h3 className="font-headline">{item.title}</h3>
                  <p className="">
                    {fmt(item.unit_price * item.quantity, item.currency_code)}
                  </p>
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {item.variant_title && item.variant_title !== "Default Variant"
                    ? item.variant_title
                    : customAttrs &&
                        Object.values(customAttrs).filter(Boolean).length > 0
                      ? Object.values(customAttrs).filter(Boolean).join(", ")
                      : "Standard Selection"}
                </p>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mb-6 pt-6 border-t border-outline-variant">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={discountCode}
            onChange={(e) => {
              onDiscountCodeChange(e.target.value)
              onClearDiscountMessages()
            }}
            placeholder="Discount code"
            id="discount-code-input"
            disabled={discountLoading}
            className="block w-full rounded-lg border-outline-variant bg-on-surface/[0.02] text-xs py-2 px-3 focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary text-primary"
          />
          <button
            onClick={onApplyDiscount}
            id="apply-discount-btn"
            disabled={discountLoading || !discountCode.trim() || !cartId}
            className="w-full sm:w-auto bg-on-surface/5 text-on-surface px-4 py-2 rounded-lg text-xs font-semibold hover:bg-on-surface/10 transition-colors disabled:opacity-50"
          >
            {discountLoading ? "…" : "Apply"}
          </button>
        </div>
        {discountError && (
          <p className="text-xs text-red-500 mt-2">{discountError}</p>
        )}
        {discountSuccess && (
          <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">
              check_circle
            </span>
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
                    onClick={() => onRemoveDiscount(p.code!)}
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

      <dl className="space-y-3 text-sm border-t border-outline-variant pt-6 mb-8">
        <div className="flex items-center justify-between text-on-surface-variant">
          <dt>Subtotal</dt>
          <dd className="font-medium text-on-surface">
            {fmt(subtotalVal, currencyCode)}
          </dd>
        </div>
        <div className="flex items-center justify-between text-on-surface-variant">
          <dt>
            {fulfillment === "delivery"
              ? shippingVal > 0 || deliveryFee > 0
                ? "Delivery"
                : "Est. delivery"
              : "Fulfillment"}
          </dt>
          <dd className="font-medium text-on-surface">
            {fulfillment === "pickup"
              ? "FREE"
              : shippingVal > 0
                ? fmt(shippingVal, currencyCode)
                : deliveryFeeError
                  ? "—"
                  : "Enter postcode"}
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
            <dd className="font-medium">- {fmt(discountVal, currencyCode)}</dd>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-outline-variant pt-4 mt-2">
          <dt className="text-base font-bold text-on-surface">Total</dt>
          <dd className="text-xl font-bold font-headline text-primary">
            {fmt(finalTotal, currencyCode)}
          </dd>
        </div>
      </dl>

      <button
        disabled={!canCheckout || isLoading}
        onClick={onCheckout}
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
          <span className="material-symbols-outlined text-[12px] mr-1">
            verified_user
          </span>{" "}
          Guaranteed safe & secure checkout
        </p>
      </div>
    </div>
  )
}
