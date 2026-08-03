"use client";

import Link from "next/link";
import { Plus, Minus, ShoppingBag, Heart, MapPin } from "lucide-react";
import { PremiumSelect } from "@/components/ui/premium-select";
import PhotoUpload from "../photo-upload";
import {
  INSCRIPTION_MAX_LENGTH,
  JAM_OPTIONS,
  MESSAGE_MAX_LENGTH,
  isFlavourOptionTitle,
} from "@/types/cake-metadata";
import {
  EditIcon,
  FlavorIcon,
  JamIcon,
  ServingsIcon,
} from "./icons";
import {
  COLLECTION_BAKERY_FIELD_ID,
  type ProductDetailModel,
} from "./use-product-detail";
import type { DietaryTag, MedusaProduct } from "./types";
import type { ReactNode } from "react";

interface PurchasePanelProps {
  product: MedusaProduct;
  dietaryTags: DietaryTag[];
  /** When set, replaces the default dietary badge list (streamed RSC slot). */
  dietaryBadgesSlot?: ReactNode;
  model: ProductDetailModel;
}

export function PurchasePanel({
  product,
  dietaryTags,
  dietaryBadgesSlot,
  model,
}: PurchasePanelProps) {
  const {
    router,
    isOfflineOrder,
    priceInfo,
    isInStock,
    servingsLabel,
    selectableOptions,
    hasFlavourOption,
    metadataFlavours,
    supportsInscription,
    supportsPhotoUpload,
    storeLocationId,
    storeName,
    storeLocations,
    storesLoading,
    storeSelectionLocked,
    handleBakeryChange,
    bakeryGateActive,
    dismissBakeryGate,
    selectedOptions,
    handleOptionChange,
    metadataFlavour,
    setMetadataFlavour,
    supportsJamFilling,
    jamOption,
    setJamOption,
    specialMessage,
    setSpecialMessage,
    inscription,
    setInscription,
    photoUrl,
    setPhotoUrl,
    quantity,
    setQuantity,
    addedToCart,
    cartError,
    isAddingToCart,
    handleAddToCart,
    handleOfflineWhatsApp,
    offlineOrderCopy,
    inWishlist,
    handleToggleWishlist,
    reviewBadge,
  } = model;

  const mapRoutingHref = `/map-routing?redirect=${encodeURIComponent(
    `/products/${product.handle}`
  )}`;
  const bakeryOptions = storeLocations.map((loc) => ({
    value: loc.id,
    label: loc.name,
    description: loc.address?.trim() || undefined,
  }));
  const locationsAvailable = !storesLoading && storeLocations.length > 0;
  const locationsUnavailable = !storesLoading && storeLocations.length === 0;

  return (
    <div className="flex flex-col space-y-6">
      <div className="space-y-3">
        {product.type && (
          <span className="inline-block px-3 py-1 rounded bg-vibrant-magenta/10 text-vibrant-magenta text-[10px] font-bold uppercase tracking-[0.2em]">
            {product.type.value}
          </span>
        )}
        <h1
          className="font-headline-xl text-3xl md:text-4xl lg:text-5xl text-deep-plum leading-tight"
          id="product-title"
        >
          {product.title}
        </h1>
        {product.subtitle && (
          <p className="font-body-lg text-on-surface-variant text-lg italic">
            {product.subtitle}
          </p>
        )}

        {reviewBadge && <div className="pt-1">{reviewBadge}</div>}

        {dietaryBadgesSlot !== undefined ? (
          dietaryBadgesSlot
        ) : (
          dietaryTags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {dietaryTags.map((tag) => (
                <span
                  key={tag.id}
                  title={tag.description ?? undefined}
                  className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold uppercase tracking-wider"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )
        )}
      </div>

      <div className="flex items-baseline gap-4">
        {priceInfo ? (
          <>
            <span className="text-3xl md:text-4xl font-headline-lg text-[#D53170]">
              {priceInfo.current}
            </span>
            {priceInfo.hasDiscount && priceInfo.original && (
              <span className="text-lg text-on-surface-variant line-through opacity-60">
                {priceInfo.original}
              </span>
            )}
            {priceInfo.hasDiscount && (
              <span className="inline-block px-2 py-0.5 rounded bg-vibrant-magenta text-white text-[10px] font-bold uppercase tracking-widest">
                Sale
              </span>
            )}
          </>
        ) : (
          <span className="text-2xl text-on-surface-variant">
            Price unavailable
          </span>
        )}
      </div>

      <div className="w-full h-px bg-outline-variant/30" />

      {/* Bakery selector — shared by online ATC and offline WhatsApp */}
      <div className="space-y-4">
        {!isOfflineOrder && (
          <h3 className="font-label-bold text-xl text-deep-plum uppercase tracking-widest">
            Customize Your Cake
          </h3>
        )}

        <div
          className={
            isOfflineOrder
              ? "grid grid-cols-1 gap-4"
              : "grid grid-cols-1 sm:grid-cols-2 gap-4"
          }
        >
          <div
            id={COLLECTION_BAKERY_FIELD_ID}
            className={`flex flex-col gap-2 bg-white p-3.5 rounded-2xl border transition-all duration-300 ${
              bakeryGateActive && !storeLocationId
                ? "border-amber-400 ring-2 ring-amber-200/80"
                : "border-outline-variant/30"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-vibrant-magenta">
                <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                <span className="text-xs font-bold text-on-surface-variant/90 uppercase tracking-wider">
                  Collection bakery
                </span>
              </div>
              {storeSelectionLocked && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                  Fixed for cart
                </span>
              )}
            </div>
            {storesLoading ? (
              <div className="h-10 w-full animate-pulse rounded-full bg-lavender-bg/80" />
            ) : storeSelectionLocked ? (
              <>
                <p className="text-sm text-deep-plum font-semibold leading-snug">
                  {storeName ?? "your selected bakery"}
                </p>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Bakery is fixed while your cart has items. Empty the cart to
                  switch branch.
                </p>
              </>
            ) : locationsAvailable ? (
              <>
                <PremiumSelect
                  label="Collection bakery"
                  value={storeLocationId ?? ""}
                  placeholder="Select bakery"
                  options={bakeryOptions}
                  onChange={handleBakeryChange}
                  active={Boolean(storeLocationId)}
                  fullWidth
                />
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  {isOfflineOrder
                    ? "Tell us which bakery you want for this order — we’ll include it in your WhatsApp message."
                    : "One bakery for the whole order. Stock and collection slots on the cart apply to this branch."}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-on-surface-variant leading-snug">
                  {storeLocationId || storeName
                    ? `Collecting from ${storeName ?? "your selected bakery"}. Bakeries could not be listed here.`
                    : "Bakeries could not be listed here right now."}
                </p>
                <Link
                  href={mapRoutingHref}
                  className="inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-full border border-deep-plum/20 bg-deep-plum px-3.5 text-xs font-semibold text-white shadow-[0_4px_14px_-4px_rgba(74,21,75,0.45)] transition-all hover:bg-vibrant-magenta"
                >
                  {storeLocationId || storeName
                    ? "Change bakery on map"
                    : "Choose bakery on map"}
                </Link>
              </>
            )}
          </div>

          {!isOfflineOrder && supportsJamFilling && (
            <div className="flex flex-col gap-2 bg-white p-3.5 rounded-2xl border border-outline-variant/30 transition-all duration-300">
              <div className="flex items-center gap-2 text-vibrant-magenta">
                <JamIcon />
                <span className="text-xs font-bold text-on-surface-variant/90 uppercase tracking-wider">
                  Jam Filling
                </span>
              </div>
              <div
                className="grid grid-cols-2 gap-2"
                role="radiogroup"
                aria-label="Jam filling"
              >
                {JAM_OPTIONS.map((opt) => {
                  const selected = jamOption === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setJamOption(opt)}
                      className={`w-full rounded-xl border-2 px-3 py-3 text-left transition-all ${
                        selected
                          ? "border-vibrant-magenta bg-vibrant-magenta/10 shadow-sm"
                          : "border-outline-variant/40 bg-lavender-bg/20 hover:border-vibrant-magenta/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-semibold leading-snug ${
                            selected
                              ? "text-deep-plum"
                              : "text-on-surface-variant"
                          }`}
                        >
                          {opt}
                        </span>
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            selected
                              ? "border-vibrant-magenta"
                              : "border-outline-variant"
                          }`}
                          aria-hidden
                        >
                          <span
                            className={`h-2 w-2 rounded-full bg-vibrant-magenta transition-transform duration-150 ${
                              selected ? "scale-100" : "scale-0"
                            }`}
                          />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {!isOfflineOrder && selectableOptions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {selectableOptions.map((option) => (
              <div
                key={option.id}
                className="flex flex-col gap-2 bg-white p-3.5 rounded-2xl border border-outline-variant/30 transition-all duration-300"
              >
                <div className="flex items-center gap-2 text-vibrant-magenta">
                  {isFlavourOptionTitle(option.title) ? (
                    <FlavorIcon />
                  ) : (
                    <ServingsIcon />
                  )}
                  <span className="text-xs font-bold text-on-surface-variant/90 uppercase tracking-wider">
                    {option.title}
                  </span>
                </div>
                <PremiumSelect
                  label={option.title}
                  value={selectedOptions[option.title] ?? ""}
                  placeholder={`Select ${option.title.toLowerCase()}`}
                  options={(option.values ?? []).map((v) => ({
                    value: v.value,
                    label: v.value,
                  }))}
                  onChange={(v) => handleOptionChange(option.title, v)}
                  active={Boolean(selectedOptions[option.title])}
                  fullWidth
                />
                {!isFlavourOptionTitle(option.title) && servingsLabel && (
                  <p className="text-[11px] text-on-surface-variant">
                    Approx. {servingsLabel}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {!isOfflineOrder &&
          ((!hasFlavourOption && metadataFlavours.length > 0) ||
            (servingsLabel && selectableOptions.length === 0)) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!hasFlavourOption && metadataFlavours.length > 0 && (
              <div className="flex flex-col gap-2 bg-white p-3.5 rounded-2xl border border-outline-variant/30 transition-all duration-300">
                <div className="flex items-center gap-2 text-vibrant-magenta">
                  <FlavorIcon />
                  <span className="text-xs font-bold text-on-surface-variant/90 uppercase tracking-wider">
                    Sponge Flavour
                  </span>
                </div>
                <PremiumSelect
                  label="Sponge flavour"
                  value={metadataFlavour}
                  placeholder="Select flavour"
                  options={metadataFlavours.map((f) => ({
                    value: f,
                    label: f,
                  }))}
                  onChange={setMetadataFlavour}
                  active={Boolean(metadataFlavour)}
                  fullWidth
                />
              </div>
            )}

            {servingsLabel && selectableOptions.length === 0 && (
              <div className="flex flex-col gap-1.5 bg-white p-3.5 rounded-2xl border border-outline-variant/30">
                <div className="flex items-center gap-2 text-vibrant-magenta">
                  <ServingsIcon />
                  <span className="text-xs font-bold text-on-surface-variant/90 uppercase tracking-wider">
                    Servings
                  </span>
                </div>
                <p className="pt-1.5 text-sm text-deep-plum">{servingsLabel}</p>
              </div>
            )}
          </div>
        )}

        {!isOfflineOrder && supportsInscription && (
          <div className="flex flex-col gap-1.5 bg-white p-3.5 rounded-2xl border border-outline-variant/30 transition-all duration-300 focus-within:border-vibrant-magenta focus-within:shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-vibrant-magenta">
                <EditIcon />
                <span className="text-xs font-bold text-on-surface-variant/90 uppercase tracking-wider">
                  Personalised Message on Cake
                </span>
              </div>
              <span className="text-[10px] tabular-nums text-on-surface-variant">
                {inscription.length}/{INSCRIPTION_MAX_LENGTH}
              </span>
            </div>
            <input
              type="text"
              value={inscription}
              maxLength={INSCRIPTION_MAX_LENGTH}
              onChange={(e) =>
                setInscription(e.target.value.slice(0, INSCRIPTION_MAX_LENGTH))
              }
              placeholder="e.g. Happy Birthday Sam"
              className="w-full pt-1.5 pb-0.5 px-0 bg-transparent text-sm text-deep-plum focus:outline-none"
            />
            <p className="text-[11px] text-on-surface-variant">
              This text is written on the cake by our decorators.
            </p>
          </div>
        )}

        {!isOfflineOrder && (
          <div className="flex flex-col gap-1.5 bg-white p-3.5 rounded-2xl border border-outline-variant/30 transition-all duration-300 focus-within:border-vibrant-magenta focus-within:shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-vibrant-magenta">
                <EditIcon />
                <span className="text-xs font-bold text-on-surface-variant/90 uppercase tracking-wider">
                  Special Instructions (Optional)
                </span>
              </div>
              <span className="text-[10px] tabular-nums text-on-surface-variant">
                {specialMessage.length}/{MESSAGE_MAX_LENGTH}
              </span>
            </div>
            <textarea
              value={specialMessage}
              maxLength={MESSAGE_MAX_LENGTH}
              onChange={(e) =>
                setSpecialMessage(e.target.value.slice(0, MESSAGE_MAX_LENGTH))
              }
              placeholder="Dietary notes, packaging, or delivery instructions…"
              rows={3}
              className="w-full pt-1.5 pb-0.5 px-0 bg-transparent text-sm text-deep-plum focus:outline-none resize-none"
            />
          </div>
        )}

        {!isOfflineOrder && supportsPhotoUpload && (
          <PhotoUpload
            value={photoUrl}
            onChange={setPhotoUrl}
            disabled={isAddingToCart}
          />
        )}
      </div>

      {bakeryGateActive && !storeLocationId && (
        <div className="relative rounded-2xl bg-amber-50 border border-amber-200 p-5 flex items-start gap-4">
          <span className="material-symbols-outlined text-amber-500 !text-[24px] mt-0.5 shrink-0">
            location_off
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-label-bold text-sm text-amber-800">
              Select a bakery location first
            </p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              {locationsAvailable
                ? isOfflineOrder
                  ? "Pick your collection bakery above so we can include it in your WhatsApp message."
                  : "Pick your collection bakery in the field above — bakery is fixed for the whole order once items are in the cart."
                : "Choose your local Cake Break boutique first — bakery is fixed for the whole order once items are in the cart."}
            </p>
            {locationsUnavailable && (
              <button
                type="button"
                onClick={() => router.push(mapRoutingHref)}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-deep-plum text-white text-xs font-label-bold uppercase tracking-widest hover:bg-vibrant-magenta transition-colors"
                id="choose-location-btn"
              >
                <span className="material-symbols-outlined !text-[14px]">
                  store
                </span>
                Choose Location
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={dismissBakeryGate}
            aria-label="Dismiss"
            className="shrink-0 text-amber-400 hover:text-amber-700 transition-colors"
          >
            <span className="material-symbols-outlined !text-[20px]">
              close
            </span>
          </button>
        </div>
      )}

      {isOfflineOrder ? (
        <div className="flex flex-col gap-3 pt-2">
          <p className="text-sm text-on-surface-variant leading-relaxed">
            {offlineOrderCopy.helper}
          </p>
          {/* Keep CTA + wishlist on one row on mobile (matches Add to Cart layout) */}
          <div className="flex items-stretch gap-3">
            <button
              type="button"
              onClick={handleOfflineWhatsApp}
              className="flex-1 min-w-0 flex items-center justify-center gap-2 sm:gap-3 h-14 px-3 sm:px-4 rounded-md font-label-bold text-xs sm:text-sm uppercase tracking-wider sm:tracking-widest transition-all duration-300 active:scale-[0.98] premium-shadow bg-[#25D366] text-white hover:bg-[#1ebe57] shadow-[0_8px_20px_-6px_rgba(37,211,102,0.55)]"
              id="offline-whatsapp-order-button"
            >
              <svg
                viewBox="0 0 32 32"
                className="h-5 w-5 shrink-0 fill-current"
                aria-hidden
              >
                <path d="M16.01 3C9.39 3 4 8.37 4 14.97c0 2.1.55 4.06 1.52 5.76L4 29l8.48-2.22A12 12 0 0 0 16 27c6.63 0 12-5.37 12-12.03C28 8.37 22.63 3 16.01 3zm0 21.86c-1.86 0-3.59-.5-5.08-1.36l-.36-.21-5.03 1.32 1.34-4.9-.24-.39A9.86 9.86 0 0 1 6.14 15c0-5.42 4.44-9.83 9.87-9.83 5.43 0 9.86 4.41 9.86 9.83 0 5.43-4.43 9.86-9.86 9.86zm5.42-7.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.04-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z" />
              </svg>
              <span className="truncate">{offlineOrderCopy.primaryCta}</span>
            </button>
            <button
              type="button"
              onClick={handleToggleWishlist}
              className={`flex items-center justify-center w-14 h-14 rounded-md border transition-all duration-300 active:scale-[0.95] shrink-0 ${
                inWishlist
                  ? "bg-pink-50 border-pink-200 text-pink-600 hover:bg-pink-100"
                  : "bg-white border-outline-variant/30 text-gray-400 hover:text-pink-600 hover:border-pink-200 hover:bg-pink-50/20"
              }`}
              title={inWishlist ? "Remove from Wishlist" : "Add to Wishlist"}
              aria-label={inWishlist ? "Remove from Wishlist" : "Add to Wishlist"}
            >
              <Heart
                className={`w-6 h-6 transition-all duration-300 ${
                  inWishlist ? "fill-pink-600 text-pink-600 scale-110" : ""
                }`}
              />
            </button>
          </div>
          <Link
            href="/contact"
            className="text-center text-sm font-semibold text-deep-plum underline decoration-deep-plum/30 underline-offset-4 hover:text-vibrant-magenta hover:decoration-vibrant-magenta transition-colors"
            id="offline-visit-bakery-link"
          >
            {offlineOrderCopy.secondaryCta}
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-4 pt-2">
          <div className="flex items-center border border-outline-variant/30 rounded-md overflow-hidden bg-white shadow-sm h-14 shrink-0">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-12 h-full flex items-center justify-center text-deep-plum hover:bg-lavender-bg transition-colors"
              aria-label="Decrease quantity"
              disabled={quantity <= 1}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-6 text-center font-label-bold text-deep-plum text-base tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="w-12 h-full flex items-center justify-center text-deep-plum hover:bg-lavender-bg transition-colors"
              aria-label="Increase quantity"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!isInStock || isAddingToCart}
            className={`flex-1 flex items-center justify-center gap-3 h-14 rounded-md font-label-bold text-sm uppercase tracking-widest transition-all duration-300 active:scale-[0.98] premium-shadow ${
              addedToCart
                ? "bg-green-600 text-white"
                : isAddingToCart
                  ? "bg-deep-plum/70 text-white cursor-wait"
                  : isInStock
                    ? "bg-deep-plum text-white hover:bg-vibrant-magenta"
                    : "bg-surface-container text-on-surface-variant cursor-not-allowed opacity-60"
            }`}
            id="add-to-cart-button"
          >
            <ShoppingBag className="w-5 h-5" />
            {addedToCart
              ? "Added to Cart!"
              : isAddingToCart
                ? "Adding..."
                : isInStock
                  ? "Add to Cart"
                  : "Out of Stock"}
          </button>

          <button
            type="button"
            onClick={handleToggleWishlist}
            className={`flex items-center justify-center w-14 h-14 rounded-md border transition-all duration-300 active:scale-[0.95] shrink-0 ${
              inWishlist
                ? "bg-pink-50 border-pink-200 text-pink-600 hover:bg-pink-100"
                : "bg-white border-outline-variant/30 text-gray-400 hover:text-pink-600 hover:border-pink-200 hover:bg-pink-50/20"
            }`}
            title={inWishlist ? "Remove from Wishlist" : "Add to Wishlist"}
            aria-label={inWishlist ? "Remove from Wishlist" : "Add to Wishlist"}
          >
            <Heart
              className={`w-6 h-6 transition-all duration-300 ${
                inWishlist ? "fill-pink-600 text-pink-600 scale-110" : ""
              }`}
            />
          </button>
        </div>
      )}

      {cartError && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-red-50 border border-red-200">
          <span className="material-symbols-outlined text-red-500 !text-[18px] shrink-0">
            error
          </span>
          <p className="text-sm text-red-700 font-label-bold">{cartError}</p>
        </div>
      )}
    </div>
  );
}
