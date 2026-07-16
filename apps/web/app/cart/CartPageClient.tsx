"use client"

import { useRouter } from "next/navigation"
import Header from "../components/Header"
import Footer from "../components/Footer"
import LocationWarningBanner from "./LocationWarningBanner"
import { CartEmptyState } from "./CartEmptyState"
import { CartFulfillmentSection } from "./CartFulfillmentSection"
import { CartLineItems } from "./CartLineItems"
import { CartOrderSummary } from "./CartOrderSummary"
import { InventoryConflictBanner } from "./InventoryConflictBanner"
import { useCartPage } from "./use-cart-page"

interface CartPageClientProps {
  franchiseId: string
  storeLocationId: string | null
}

export default function CartPageClient({
  franchiseId,
  storeLocationId: initialLocationId,
}: CartPageClientProps) {
  const router = useRouter()
  const model = useCartPage(franchiseId, initialLocationId)

  if (!model.isLoading && (!model.cart?.items || model.cart.items.length === 0)) {
    return <CartEmptyState />
  }

  const items = model.cart?.items ?? []

  return (
    <div className="flex flex-col min-h-screen bg-[#EEDFF5] font-body selection:bg-secondary selection:text-on-secondary">
      <Header />
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-8 lg:py-16 bg-transparent pt-28">
        <div className="mb-10">
          <h1 className="font-headline text-[32px] md:text-[40px] font-extrabold tracking-tight text-primary">
            Your Confectionery Cart
          </h1>
          <p className="text-on-surface-variant text-body-lg mt-2">
            Review your selection before we start baking.
          </p>
        </div>

        {model.locationWarning && (
          <LocationWarningBanner
            message={model.locationWarning}
            onDismiss={() => model.setLocationWarning(null)}
          />
        )}

        {model.inventoryResult &&
          !model.inventoryResult.all_sufficient &&
          items.length > 0 && (
            <InventoryConflictBanner
              inventoryResult={model.inventoryResult}
              locationName={model.locationName}
              adjustingCart={model.adjustingCart}
              isLoading={model.isLoading}
              onAdjust={model.handleAdjustToAvailability}
            />
          )}

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 relative">
          <div className="w-full lg:w-[65%] flex flex-col gap-10">
            <CartLineItems
              items={items}
              isLoading={model.isLoading}
              inventoryResult={model.inventoryResult}
              onRemove={model.removeFromCart}
              onUpdateQuantity={model.updateQuantity}
            />

            <hr className="border-surface-variant border-t" />

            <CartFulfillmentSection
              fulfillment={model.fulfillment}
              onFulfillmentChange={(method) => {
                model.setFulfillment(method)
                void model.persistFulfillment(method)
              }}
              locationId={model.locationId}
              locationName={model.locationName}
              locationAddress={model.locationAddress}
              selectedDate={model.selectedDate}
              selectedTime={model.selectedTime}
              selectedTimeLabel={model.selectedTimeLabel}
              onDateChange={(d) => void model.handleDateChange(d)}
              onSlotChange={(s) => void model.handleSlotChange(s)}
              deliveryPostcode={model.deliveryPostcode}
              onDeliveryPostcodeChange={model.setDeliveryPostcode}
              deliveryFee={model.deliveryFee}
              deliveryFeeLoading={model.deliveryFeeLoading}
              deliveryFeeError={model.deliveryFeeError}
              deliveryDistanceKm={model.deliveryDistanceKm}
              onQuoteDeliveryFee={() => void model.quoteDeliveryFee()}
              currencyCode={model.currencyCode}
            />
          </div>

          <div className="w-full lg:w-[35%]">
            <CartOrderSummary
              items={items}
              currencyCode={model.currencyCode}
              cartId={model.cartId}
              isLoading={model.isLoading}
              canCheckout={model.canCheckout}
              onCheckout={() => router.push("/checkout-page")}
              fulfillment={model.fulfillment}
              shippingVal={model.shippingVal}
              deliveryFee={model.deliveryFee}
              deliveryFeeError={model.deliveryFeeError}
              subtotalVal={model.subtotalVal}
              taxVal={model.taxVal}
              discountVal={model.discountVal}
              finalTotal={model.finalTotal}
              appliedPromos={model.appliedPromos}
              discountCode={model.discountCode}
              onDiscountCodeChange={model.setDiscountCode}
              discountLoading={model.discountLoading}
              discountError={model.discountError}
              discountSuccess={model.discountSuccess}
              onApplyDiscount={() => void model.handleApplyDiscount()}
              onRemoveDiscount={(code) => void model.handleRemoveDiscount(code)}
              onClearDiscountMessages={() => {
                model.setDiscountError(null)
                model.setDiscountSuccess(null)
              }}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
