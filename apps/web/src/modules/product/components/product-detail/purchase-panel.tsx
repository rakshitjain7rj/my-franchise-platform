"use client";

import Link from "next/link";
import { Plus, Minus, ShoppingBag, Heart, MapPin } from "lucide-react";
import TimeSlotPicker from "@/components/time-slot-picker";
import { PremiumSelect } from "@/components/ui/premium-select";
import PhotoUpload from "../photo-upload";
import {
  INSCRIPTION_MAX_LENGTH,
  JAM_OPTIONS,
  MESSAGE_MAX_LENGTH,
  isFlavourOptionTitle,
} from "@/types/cake-metadata";
import {
  CalendarIcon,
  EditIcon,
  FlavorIcon,
  JamIcon,
  ServingsIcon,
} from "./icons";
import type { ProductDetailModel } from "./use-product-detail";
import type { DietaryTag, MedusaProduct } from "./types";

interface PurchasePanelProps {
  product: MedusaProduct;
  dietaryTags: DietaryTag[];
  model: ProductDetailModel;
}

export function PurchasePanel({
  product,
  dietaryTags,
  model,
}: PurchasePanelProps) {
  const {
    router,
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
    storesLoading,
    storeSelectOptions,
    handleStoreChange,
    selectedOptions,
    handleOptionChange,
    metadataFlavour,
    setMetadataFlavour,
    jamOption,
    setJamOption,
    collectionDate,
    setCollectionDate,
    collectionTime,
    handleSlotChange,
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
    showLocationModal,
    setShowLocationModal,
    handleAddToCart,
    inWishlist,
    handleToggleWishlist,
    reviewBadge,
  } = model;

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

        {dietaryTags.length > 0 && (
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

      <div className="space-y-4">
        <h3 className="font-label-bold text-xl text-deep-plum uppercase tracking-widest">
          Customize Your Cake
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2 bg-white p-3.5 rounded-2xl border border-outline-variant/30 transition-all duration-300">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-vibrant-magenta">
                <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                <span className="text-xs font-bold text-on-surface-variant/90 uppercase tracking-wider">
                  Collection bakery
                </span>
              </div>
              {storeSelectOptions.length > 1 && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                  Change anytime
                </span>
              )}
            </div>
            {storesLoading ? (
              <div className="h-10 w-full animate-pulse rounded-full bg-lavender-bg/80" />
            ) : storeSelectOptions.length > 0 ? (
              <>
                <PremiumSelect
                  label="Collection bakery"
                  value={storeLocationId ?? ""}
                  placeholder="Select a bakery"
                  options={storeSelectOptions}
                  onChange={handleStoreChange}
                  active={Boolean(storeLocationId)}
                  fullWidth
                  contentClassName="z-50"
                />
                {storeName && storeLocationId && (
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Ordering from{" "}
                    <span className="font-semibold text-deep-plum">
                      {storeName}
                    </span>
                    . Collection slots and stock update for this bakery.
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-on-surface-variant">
                  {storeName
                    ? `Current bakery: ${storeName}`
                    : "No bakery selected yet."}
                </p>
                <Link
                  href={`/map-routing?redirect=${encodeURIComponent(
                    `/products/${product.handle}`
                  )}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-deep-plum/20 bg-deep-plum px-3.5 text-xs font-semibold text-white shadow-[0_4px_14px_-4px_rgba(74,21,75,0.45)] transition-all hover:bg-vibrant-magenta"
                >
                  Choose bakery
                </Link>
              </div>
            )}
          </div>

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
                          selected ? "text-deep-plum" : "text-on-surface-variant"
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
        </div>

        {selectableOptions.length > 0 && (
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

        <div className="bg-white p-3.5 rounded-2xl border border-outline-variant/30 space-y-3">
          <div className="flex items-center gap-2 text-vibrant-magenta">
            <CalendarIcon />
            <span className="text-xs font-bold text-on-surface-variant/90 uppercase tracking-wider">
              Collection date &amp; time
            </span>
          </div>
          <TimeSlotPicker
            storeLocationId={storeLocationId}
            date={collectionDate}
            selectedTime={collectionTime}
            onDateChange={(d) => {
              setCollectionDate(d);
              handleSlotChange(null);
            }}
            onSlotChange={handleSlotChange}
            compact
          />
        </div>

        {((!hasFlavourOption && metadataFlavours.length > 0) ||
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

        {supportsInscription && (
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

        {supportsPhotoUpload && (
          <PhotoUpload
            value={photoUrl}
            onChange={setPhotoUrl}
            disabled={isAddingToCart}
          />
        )}
      </div>

      {showLocationModal && (
        <div className="relative rounded-2xl bg-amber-50 border border-amber-200 p-5 flex items-start gap-4">
          <span className="material-symbols-outlined text-amber-500 !text-[24px] mt-0.5 shrink-0">
            location_off
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-label-bold text-sm text-amber-800">
              Select a bakery location first
            </p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              {storeSelectOptions.length > 0
                ? "Use the Collection bakery dropdown above to pick your local Cake Break boutique, then add this cake to your cart."
                : "You need to choose your local Cake Break boutique before adding items to your cart."}
            </p>
            {storeSelectOptions.length === 0 && (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/map-routing?redirect=${encodeURIComponent(
                      `/products/${product.handle}`
                    )}`
                  )
                }
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
            onClick={() => setShowLocationModal(false)}
            aria-label="Dismiss"
            className="shrink-0 text-amber-400 hover:text-amber-700 transition-colors"
          >
            <span className="material-symbols-outlined !text-[20px]">
              close
            </span>
          </button>
        </div>
      )}

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
