"use client"

import TimeSlotPicker, {
  type SlotSelection,
} from "@/components/time-slot-picker"
import { DELIVERY_POLICY_COPY } from "@/lib/data/logistics"
import { fmt } from "./format"

interface CartFulfillmentSectionProps {
  fulfillment: "pickup" | "delivery"
  onFulfillmentChange: (method: "pickup" | "delivery") => void
  locationName: string | null
  locationAddress: string | null
  storeLocationId: string | null
  collectionDate: string
  collectionTime: string
  onCollectionDateChange: (date: string) => void
  onCollectionSlotChange: (slot: SlotSelection | null) => void
  collectionSlotSaving?: boolean
  collectionSlotError?: string | null
  deliveryPostcode: string
  onDeliveryPostcodeChange: (value: string) => void
  deliveryFee: number
  deliveryFeeLoading: boolean
  deliveryFeeError: string | null
  deliveryDistanceMi: number | null
  deliveryDeliverable: boolean
  amountToFreeDelivery: number
  onQuoteDeliveryFee: () => void
  currencyCode: string
}

/**
 * Cart-level fulfillment: collection date/time (order-wide), pickup vs
 * delivery, and delivery postcode quote.
 */
export function CartFulfillmentSection({
  fulfillment,
  onFulfillmentChange,
  locationName,
  locationAddress,
  storeLocationId,
  collectionDate,
  collectionTime,
  onCollectionDateChange,
  onCollectionSlotChange,
  collectionSlotSaving = false,
  collectionSlotError = null,
  deliveryPostcode,
  onDeliveryPostcodeChange,
  deliveryFee,
  deliveryFeeLoading,
  deliveryFeeError,
  deliveryDistanceMi,
  deliveryDeliverable,
  amountToFreeDelivery,
  onQuoteDeliveryFee,
  currencyCode,
}: CartFulfillmentSectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-headline text-xl font-bold text-primary">
        How would you like to receive this?
      </h2>

      <div className="bg-surface-container-lowest p-5 sm:p-6 rounded-2xl border border-outline-variant/30 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-secondary">
          <span className="material-symbols-outlined text-[20px]" data-weight="fill">
            calendar_month
          </span>
          <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
            Collection date &amp; time
          </h3>
        </div>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          One collection window for your whole order. We bake and prepare
          everything for this day and time.
        </p>
        <TimeSlotPicker
          storeLocationId={storeLocationId}
          date={collectionDate}
          selectedTime={collectionTime}
          onDateChange={onCollectionDateChange}
          onSlotChange={onCollectionSlotChange}
        />
        {collectionSlotSaving && (
          <p className="text-xs text-on-surface-variant" role="status">
            Saving collection time…
          </p>
        )}
        {collectionSlotError && (
          <p className="text-xs text-red-600" role="alert">
            {collectionSlotError}
          </p>
        )}
      </div>

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
            Collect your order from the selected bakery at the collection date
            and time above.
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
                  {deliveryDeliverable && !deliveryFeeError
                    ? deliveryFee > 0
                      ? `${fmt(deliveryFee, currencyCode)} · by distance`
                      : "Free"
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
            <span className="font-semibold text-primary">Delivery: </span>
            {DELIVERY_POLICY_COPY} Enter your postcode below to see the exact
            fee.
          </p>
        </button>
      </div>

      {locationName && (
        <div className="mt-4 p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-tertiary-fixed/50 flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined">location_on</span>
          </div>
          <div className="flex-grow">
            <h4 className="font-headline font-bold text-primary text-sm">
              {fulfillment === "pickup"
                ? "Selected Pickup Location"
                : "Selected Bakery"}
            </h4>
            <p className="text-on-surface-variant text-sm mt-1 font-medium">
              {locationName}
            </p>
            {locationAddress && (
              <p className="text-on-surface-variant/70 text-xs">
                {locationAddress}
              </p>
            )}
            <p className="text-[11px] text-on-surface-variant/80 mt-2 leading-relaxed">
              Bakery is fixed for this order. Empty your cart to shop from a
              different branch.
            </p>
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
          {!deliveryFeeError && deliveryDeliverable && (
            <p className="text-xs text-on-surface-variant">
              Delivery fee:{" "}
              <strong className="text-primary">
                {deliveryFee > 0 ? fmt(deliveryFee, currencyCode) : "Free"}
              </strong>
              {deliveryDistanceMi != null && (
                <> · ~{deliveryDistanceMi.toFixed(1)} mi</>
              )}
            </p>
          )}
          {!deliveryFeeError &&
            deliveryDeliverable &&
            deliveryFee > 0 &&
            amountToFreeDelivery > 0 && (
              <p className="text-xs text-secondary font-medium">
                Add {fmt(amountToFreeDelivery, currencyCode)} more for free
                delivery
              </p>
            )}
        </div>
      )}
    </section>
  )
}
