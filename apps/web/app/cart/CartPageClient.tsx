"use client"

import { useRouter } from "next/navigation"
import Header from "../components/Header"
import Footer from "../components/Footer"
import LocationWarningBanner from "./LocationWarningBanner"
import { CartAllergyNotice } from "./CartAllergyNotice"
import { CartEmptyState } from "./CartEmptyState"
import { CartFulfillmentSection } from "./CartFulfillmentSection"
import { CartLineItems } from "./CartLineItems"
import { CartOrderSummary } from "./CartOrderSummary"
import { InventoryConflictBanner } from "./InventoryConflictBanner"
import { OfflineRemovedBanner } from "./OfflineRemovedBanner"
import { useCartPage } from "./use-cart-page"
import { useCart } from "@/lib/cart/cart-context"

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
  const {
    removedOfflineItems,
    removedOfflineBanner,
    dismissRemovedOfflineItems,
  } = useCart()

  if (!model.isLoading && (!model.cart?.items || model.cart.items.length === 0)) {
    // Banner state survives empty cart after scrub so shoppers still see why.
    if (removedOfflineItems.length > 0) {
      return (
        <div className="flex flex-col min-h-screen bg-[#EEDFF5] font-body">
          <Header />
          <main className="flex-grow w-full max-w-2xl mx-auto px-4 pt-24 sm:pt-28 pb-16">
            <OfflineRemovedBanner
              message={removedOfflineBanner}
              titles={removedOfflineItems}
              onDismiss={dismissRemovedOfflineItems}
            />
            <div className="text-center space-y-6 mt-4 px-6 py-12 bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm">
              <h1 className="font-headline font-bold text-3xl text-primary">
                Your cart is empty
              </h1>
              <p className="text-on-surface-variant text-sm max-w-xs mx-auto leading-relaxed">
                Order wedding and icing cakes via WhatsApp or visit us — other
                cakes can be added from the catalogue.
              </p>
              <a
                href="/cake-catalogue"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-deep-plum text-white font-headline font-bold text-sm uppercase tracking-widest hover:bg-secondary transition-all"
              >
                Browse Cakes
              </a>
            </div>
          </main>
          <Footer />
        </div>
      )
    }
    return <CartEmptyState />
  }

  const items = model.cart?.items ?? []

  return (
    <div className="flex flex-col min-h-screen bg-[#EEDFF5] font-body selection:bg-secondary selection:text-on-secondary">
      <Header />
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-8 lg:py-16 bg-transparent pt-20 sm:pt-28 pb-20 md:pb-16">
        <div className="mb-6 sm:mb-10">
          <h1 className="font-headline text-[28px] sm:text-[32px] md:text-[40px] font-extrabold tracking-tight text-primary">
            Your Confectionery Cart
          </h1>
          <p className="text-on-surface-variant text-body-lg mt-2">
            Review your selection before we start baking.
          </p>
        </div>

        {removedOfflineItems.length > 0 && (
          <OfflineRemovedBanner
            message={removedOfflineBanner}
            titles={removedOfflineItems}
            onDismiss={dismissRemovedOfflineItems}
          />
        )}

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
            <CartAllergyNotice />

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
              locationName={model.locationName}
              locationAddress={model.locationAddress}
              storeLocationId={model.locationId}
              collectionDate={model.collectionDate}
              collectionTime={model.collectionTime}
              onCollectionDateChange={model.handleCollectionDateChange}
              onCollectionSlotChange={(slot) =>
                void model.handleCollectionSlotChange(slot)
              }
              collectionSlotSaving={model.collectionSlotSaving}
              collectionSlotError={model.collectionSlotError}
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
