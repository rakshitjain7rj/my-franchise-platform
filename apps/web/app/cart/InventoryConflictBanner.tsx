"use client"

import type { InventoryCheckResult } from "@/lib/cart/cart-context"

interface InventoryConflictBannerProps {
  inventoryResult: InventoryCheckResult
  locationName: string | null
  adjustingCart: boolean
  isLoading: boolean
  onAdjust: () => void
}

export function InventoryConflictBanner({
  inventoryResult,
  locationName,
  adjustingCart,
  isLoading,
  onAdjust,
}: InventoryConflictBannerProps) {
  return (
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
              "This location's inventory is not configured yet. Empty your cart, then choose another bakery from Find a Bakery."
            : "The items flagged below are out of stock or short at your selected bakery. Adjust quantities or remove them — bakery can't be changed while items are in your cart."}
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {inventoryResult.reason !== "STORE_HAS_NO_STOCK_LOCATION" && (
            <button
              type="button"
              onClick={onAdjust}
              disabled={adjustingCart || isLoading}
              className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-label-bold text-xs px-4 py-2 rounded-full transition-colors"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {adjustingCart ? "progress_activity" : "auto_fix"}
              </span>
              {adjustingCart ? "Adjusting…" : "Adjust cart to availability"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
