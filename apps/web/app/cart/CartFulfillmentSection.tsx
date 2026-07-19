"use client"

import Link from "next/link"
import { fmt } from "./format"

interface CartFulfillmentSectionProps {
  fulfillment: "pickup" | "delivery"
  onFulfillmentChange: (method: "pickup" | "delivery") => void
  locationName: string | null
  locationAddress: string | null
  deliveryPostcode: string
  onDeliveryPostcodeChange: (value: string) => void
  deliveryFee: number
  deliveryFeeLoading: boolean
  deliveryFeeError: string | null
  deliveryDistanceKm: number | null
  onQuoteDeliveryFee: () => void
  currencyCode: string
}

/**
 * Cart-level fulfillment: pickup vs delivery + delivery postcode quote.
 * Collection date/time is chosen per cake on the product page and shown on
 * each line item — not re-edited here (avoids cart→checkout drift).
 */
export function CartFulfillmentSection({
  fulfillment,
  onFulfillmentChange,
  locationName,
  locationAddress,
  deliveryPostcode,
  onDeliveryPostcodeChange,
  deliveryFee,
  deliveryFeeLoading,
  deliveryFeeError,
  deliveryDistanceKm,
  onQuoteDeliveryFee,
  currencyCode,
}: CartFulfillmentSectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-headline text-xl font-bold text-primary">
        How would you like to receive this?
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onFulfillmentChange("pickup")}
          className={`w-full p-6 rounded-xl border-2 transition-all flex flex-col gap-4 text-left ${
            fulfillment === "pickup"
              ? "border-secondary bg-secondary-fixed/20"
              : "border-outline-variant/30 bg-surface-container-lowest hover:border-secondary-container"
          }`}
        >
          <div className="flex justify-between items-start w-full">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/10 text-secondary">
                <span
                  className="material-symbols-outlined text-[24px]"
                  data-weight="fill"
                >
                  storefront
                </span>
              </div>
              <div>
                <span className="block font-headline font-bold text-primary text-base">
                  Store Pickup
                </span>
                <span className="text-[12px] font-medium text-secondary uppercase tracking-wider">
                  Complimentary
                </span>
              </div>
            </div>
            <div
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                fulfillment === "pickup"
                  ? "border-secondary"
                  : "border-outline-variant"
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-secondary transition-transform duration-200 ${
                  fulfillment === "pickup" ? "scale-100" : "scale-0"
                }`}
              />
            </div>
          </div>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Collect your order from the selected bakery at the date and time
            chosen on each product.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onFulfillmentChange("delivery")}
          className={`w-full p-6 rounded-xl border-2 transition-all flex flex-col gap-4 text-left ${
            fulfillment === "delivery"
              ? "border-secondary bg-secondary-fixed/20"
              : "border-outline-variant/30 bg-surface-container-lowest hover:border-secondary-container"
          }`}
        >
          <div className="flex justify-between items-start w-full">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/5 text-primary">
                <span className="material-symbols-outlined text-[24px]">
                  local_shipping
                </span>
              </div>
              <div>
                <span className="block font-headline font-bold text-primary text-base">
                  Local Delivery
                </span>
                <span className="text-[12px] font-medium text-on-surface-variant uppercase tracking-wider">
                  {deliveryFee > 0 && !deliveryFeeError
                    ? `${fmt(deliveryFee, currencyCode)} · by distance`
                    : "Calculated by distance"}
                </span>
              </div>
            </div>
            <div
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                fulfillment === "delivery"
                  ? "border-secondary"
                  : "border-outline-variant"
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-secondary transition-transform duration-200 ${
                  fulfillment === "delivery" ? "scale-100" : "scale-0"
                }`}
              />
            </div>
          </div>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Delivered within ~10 km of your selected bakery. Enter your
            postcode below to see the exact fee.
          </p>
        </button>
      </div>

      {locationName && (
        <div className="mt-4 p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-tertiary-fixed/50 flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined">location_on</span>
          </div>
          <div className="flex-grow">
            <div className="flex justify-between items-start">
              <h4 className="font-headline font-bold text-primary text-sm">
                {fulfillment === "pickup"
                  ? "Selected Pickup Location"
                  : "Selected Bakery"}
              </h4>
              <Link
                href={`/map-routing?redirect=/cart`}
                className="text-secondary hover:text-secondary-container text-xs font-bold uppercase tracking-widest transition-colors"
              >
                Change Store
              </Link>
            </div>
            <p className="text-on-surface-variant text-sm mt-1 font-medium">
              {locationName}
            </p>
            {locationAddress && (
              <p className="text-on-surface-variant/70 text-xs">
                {locationAddress}
              </p>
            )}
          </div>
        </div>
      )}

      {fulfillment === "delivery" && (
        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-container shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
            Delivery postcode
          </h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={deliveryPostcode}
              onChange={(e) =>
                onDeliveryPostcodeChange(e.target.value.toUpperCase())
              }
              placeholder="e.g. SW1A 1AA"
              className="flex-1 rounded-xl border border-outline-variant px-3 py-2.5 text-sm uppercase tracking-wide focus:outline-none focus:border-secondary"
            />
            <button
              type="button"
              onClick={onQuoteDeliveryFee}
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

      <p className="text-xs text-on-surface-variant">
        Collection date and time are set when you add each cake (product page).
        Check the details under each item above.
      </p>
    </section>
  )
}
