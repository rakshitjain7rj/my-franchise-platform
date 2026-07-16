"use client";

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { SlotSelection } from "@/components/time-slot-picker";
import { useCart } from "@/lib/cart/cart-context";
import { medusaFetch } from "@/lib/medusa";
import { useSelectedStore } from "@/lib/store-selection";
import {
  addToWishlist,
  removeFromWishlist,
  isInWishlist,
} from "@/lib/wishlist";
import { defaultMinCollectionDate } from "@/lib/data/logistics";
import {
  DEFAULT_JAM_OPTION,
  buildCustomAttributes,
  isFlavourOptionTitle,
  isTruthyMetaFlag,
  resolveAllergenLabels,
  resolveIngredientsText,
  resolveServingsForVariant,
  resolveStorageServingText,
  resolveSupportedFlavours,
  type JamOption,
} from "@/types/cake-metadata";
import { getVariantPrice } from "./price";
import { resolveFullProductDescription } from "./product-description";
import type { MedusaProduct, StoreLocationOption } from "./types";

const PRODUCT_DETAIL_SOURCE = "product-detail";

export function useProductDetail(product: MedusaProduct) {
  const router = useRouter();
  const { addToCart } = useCart();

  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >(() => {
    const initial: Record<string, string> = {};
    for (const option of product.options ?? []) {
      if (option.values?.[0]) {
        initial[option.title] = option.values[0].value;
      }
    }
    return initial;
  });

  const hasFlavourOption = useMemo(
    () => (product.options ?? []).some((o) => isFlavourOptionTitle(o.title)),
    [product.options]
  );

  const metadataFlavours = useMemo(
    () =>
      resolveSupportedFlavours({
        options: product.options,
        metadata: product.metadata,
      }),
    [product.options, product.metadata]
  );

  const [metadataFlavour, setMetadataFlavour] = useState(
    () => metadataFlavours[0] ?? ""
  );
  const [collectionDate, setCollectionDate] = useState(
    defaultMinCollectionDate()
  );
  const [collectionTime, setCollectionTime] = useState("");
  const [collectionTimeLabel, setCollectionTimeLabel] = useState("");

  // Guard slot-clear + refresh so same-store re-emits (name hydrate, map
  // re-click, bootstrap echo) do not wipe a chosen collection time.
  const storeLocationIdRef = useRef<string | null>(null);

  const {
    storeLocationId,
    storeName,
    franchiseId,
    selectStore: selectStoreSelection,
  } = useSelectedStore({
    ignoreSource: PRODUCT_DETAIL_SOURCE,
    onExternalChange: (next) => {
      const nextId = next.storeLocationId;
      if (nextId && nextId !== storeLocationIdRef.current) {
        setCollectionTime("");
        setCollectionTimeLabel("");
        router.refresh();
      }
    },
  });

  useEffect(() => {
    storeLocationIdRef.current = storeLocationId;
  }, [storeLocationId]);

  const [jamOption, setJamOption] = useState<JamOption>(DEFAULT_JAM_OPTION);
  const [specialMessage, setSpecialMessage] = useState("");
  const [inscription, setInscription] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [inWishlist, setInWishlist] = useState(false);
  const [reviewBadge, setReviewBadge] = useState<ReactNode>(null);
  const [storeLocations, setStoreLocations] = useState<StoreLocationOption[]>(
    []
  );
  const [storesLoading, setStoresLoading] = useState(true);

  const handleReviewBadge = useCallback((badge: ReactNode) => {
    setReviewBadge(badge);
  }, []);

  const supportsInscription = isTruthyMetaFlag(
    product.metadata?.supports_inscription
  );

  const supportsPhotoUpload =
    isTruthyMetaFlag(product.metadata?.supports_photo_upload) ||
    /photo/i.test(product.collection?.handle ?? "") ||
    /photo/i.test(product.collection?.title ?? "") ||
    /photo/i.test(product.type?.value ?? "");

  useEffect(() => {
    setInWishlist(isInWishlist(product.id));
    const handleWishlistUpdate = () => {
      setInWishlist(isInWishlist(product.id));
    };
    window.addEventListener("wishlist-updated", handleWishlistUpdate);
    return () =>
      window.removeEventListener("wishlist-updated", handleWishlistUpdate);
  }, [product.id]);

  // Load franchise store locations for the in-page switcher
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!franchiseId) {
        if (!cancelled) {
          setStoreLocations([]);
          setStoresLoading(false);
        }
        return;
      }

      setStoresLoading(true);
      const { data, error } = await medusaFetch<{
        locations: StoreLocationOption[];
      }>({
        path: `/store/franchises/${encodeURIComponent(franchiseId)}/locations`,
        cache: "no-store",
      });

      if (cancelled) return;

      if (error || !data?.locations) {
        console.warn("[ProductDetail] Failed to load store locations:", error);
        setStoreLocations([]);
        setStoresLoading(false);
        return;
      }

      const locations = data.locations.filter((l) => Boolean(l?.id && l?.name));
      setStoreLocations(locations);
      setStoresLoading(false);

      if (storeLocationId && !storeName) {
        const match = locations.find((l) => l.id === storeLocationId);
        if (match?.name) {
          selectStoreSelection(
            {
              storeLocationId,
              storeName: match.name,
              franchiseId: franchiseId ?? undefined,
            },
            PRODUCT_DETAIL_SOURCE
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only re-fetch when franchise changes; store name hydrate is one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [franchiseId]);

  const storeSelectOptions = useMemo(() => {
    const opts = storeLocations.map((loc) => ({
      value: loc.id,
      label: loc.name,
      description: loc.address?.trim() || undefined,
    }));
    if (
      storeLocationId &&
      storeName &&
      !opts.some((o) => o.value === storeLocationId)
    ) {
      opts.unshift({
        value: storeLocationId,
        label: storeName,
        description: undefined,
      });
    }
    return opts;
  }, [storeLocations, storeLocationId, storeName]);

  const handleStoreChange = useCallback(
    (nextStoreId: string) => {
      if (!nextStoreId || nextStoreId === storeLocationId) return;

      const next = storeLocations.find((l) => l.id === nextStoreId);
      const nextName = next?.name ?? "Selected bakery";

      selectStoreSelection(
        {
          storeLocationId: nextStoreId,
          storeName: nextName,
          franchiseId: franchiseId ?? undefined,
        },
        PRODUCT_DETAIL_SOURCE
      );
      setShowLocationModal(false);
      setCartError(null);
      setCollectionTime("");
      setCollectionTimeLabel("");
      router.refresh();
    },
    [
      storeLocationId,
      storeLocations,
      selectStoreSelection,
      franchiseId,
      router,
    ]
  );

  const handleSlotChange = useCallback((slot: SlotSelection | null) => {
    if (!slot) {
      setCollectionTime("");
      setCollectionTimeLabel("");
      return;
    }
    setCollectionDate(slot.date);
    setCollectionTime(slot.time);
    setCollectionTimeLabel(slot.label);
  }, []);

  useEffect(() => {
    if (!hasFlavourOption && metadataFlavours.length && !metadataFlavour) {
      setMetadataFlavour(metadataFlavours[0]);
    }
  }, [hasFlavourOption, metadataFlavours, metadataFlavour]);

  const activeVariant = useMemo(() => {
    if (!product.variants?.length) return null;
    if (!product.options?.length) return product.variants[0];

    return (
      product.variants.find((variant) =>
        (variant.options ?? []).every(
          (opt) => selectedOptions[opt.option?.title ?? ""] === opt.value
        )
      ) ?? product.variants[0]
    );
  }, [product.variants, product.options, selectedOptions]);

  const priceInfo = activeVariant ? getVariantPrice(activeVariant) : null;

  const isInStock =
    activeVariant?.manage_inventory === false ||
    (activeVariant?.inventory_quantity ?? 1) > 0;

  const servingsLabel = useMemo(
    () =>
      resolveServingsForVariant({
        variant: activeVariant,
        productMetadata: product.metadata,
      }),
    [activeVariant, product.metadata]
  );

  const resolvedFlavour = useMemo(() => {
    if (hasFlavourOption) {
      const title =
        (product.options ?? []).find((o) => isFlavourOptionTitle(o.title))
          ?.title ?? "Flavor";
      return selectedOptions[title] ?? "";
    }
    return metadataFlavour;
  }, [hasFlavourOption, product.options, selectedOptions, metadataFlavour]);

  const galleryImages = useMemo(() => {
    const imgs: Array<{ url: string; alt?: string }> = [];
    if (product.thumbnail) {
      imgs.push({ url: product.thumbnail, alt: product.title });
    }
    for (const img of product.images ?? []) {
      if (img.url && img.url !== product.thumbnail) {
        imgs.push({ url: img.url });
      }
    }
    return imgs;
  }, [product.thumbnail, product.images, product.title]);

  const selectableOptions = useMemo(
    () =>
      (product.options ?? []).filter(
        (o) => !isFlavourOptionTitle(o.title) || hasFlavourOption
      ),
    [product.options, hasFlavourOption]
  );

  const handleOptionChange = (optionTitle: string, value: string) => {
    setSelectedOptions((prev) => ({ ...prev, [optionTitle]: value }));
    setAddedToCart(false);
    setCartError(null);
  };

  const handleToggleWishlist = () => {
    if (inWishlist) {
      removeFromWishlist(product.id);
    } else {
      const priceString = priceInfo ? priceInfo.current : "Price unavailable";
      addToWishlist({
        id: product.id,
        title: product.title,
        handle: product.handle,
        thumbnail: product.thumbnail,
        price: priceString,
      });
    }
  };

  const handleAddToCart = useCallback(async () => {
    if (!activeVariant) return;

    if (!storeLocationId) {
      setShowLocationModal(true);
      return;
    }

    if (!collectionDate || !collectionTime) {
      setCartError("Please choose a collection date and time slot.");
      return;
    }

    setIsAddingToCart(true);
    setCartError(null);
    try {
      const extraOptions: Record<string, string> = {};
      for (const [title, value] of Object.entries(selectedOptions)) {
        if (isFlavourOptionTitle(title)) continue;
        extraOptions[title] = value;
      }

      const customAttributes = buildCustomAttributes({
        flavour: resolvedFlavour || undefined,
        servings: servingsLabel || undefined,
        jam: jamOption,
        date: collectionDate,
        time: collectionTimeLabel || collectionTime,
        message: specialMessage.trim() || undefined,
        photo_url: photoUrl || undefined,
        extraOptions,
      });

      await addToCart({
        variantId: activeVariant.id,
        quantity,
        storeLocationId,
        customAttributes,
        inscription: supportsInscription
          ? inscription.trim() || undefined
          : undefined,
        collectionSlot: {
          date: collectionDate,
          time: collectionTime,
          label: collectionTimeLabel || collectionTime,
        },
      });

      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2500);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not add item to cart.";
      setCartError(msg);
    } finally {
      setIsAddingToCart(false);
    }
  }, [
    activeVariant,
    quantity,
    selectedOptions,
    inscription,
    collectionDate,
    collectionTime,
    collectionTimeLabel,
    jamOption,
    specialMessage,
    photoUrl,
    resolvedFlavour,
    servingsLabel,
    supportsInscription,
    storeLocationId,
    addToCart,
  ]);

  const allergenLabels = useMemo(
    () => resolveAllergenLabels(product.metadata),
    [product.metadata]
  );

  const ingredientsText = useMemo(
    () =>
      resolveIngredientsText({
        material: product.material,
        metadata: product.metadata,
      }),
    [product.material, product.metadata]
  );

  const storageText = useMemo(
    () => resolveStorageServingText(product.metadata),
    [product.metadata]
  );

  const fullDescription = useMemo(
    () => resolveFullProductDescription(product),
    [product]
  );

  const touchCartUi = useCallback(() => {
    setAddedToCart(false);
    setCartError(null);
  }, []);

  return {
    router,
    // product-derived
    galleryImages,
    fullDescription,
    priceInfo,
    isInStock,
    servingsLabel,
    selectableOptions,
    hasFlavourOption,
    metadataFlavours,
    allergenLabels,
    ingredientsText,
    storageText,
    supportsInscription,
    supportsPhotoUpload,
    // store
    storeLocationId,
    storeName,
    storeLocations,
    storesLoading,
    storeSelectOptions,
    handleStoreChange,
    // configure
    selectedOptions,
    handleOptionChange,
    metadataFlavour,
    setMetadataFlavour,
    jamOption,
    setJamOption: (opt: JamOption) => {
      setJamOption(opt);
      touchCartUi();
    },
    collectionDate,
    setCollectionDate,
    collectionTime,
    collectionTimeLabel,
    handleSlotChange,
    specialMessage,
    setSpecialMessage,
    inscription,
    setInscription,
    photoUrl,
    setPhotoUrl,
    quantity,
    setQuantity,
    // cart / wishlist
    addedToCart,
    cartError,
    isAddingToCart,
    showLocationModal,
    setShowLocationModal,
    handleAddToCart,
    inWishlist,
    handleToggleWishlist,
    // reviews
    reviewBadge,
    handleReviewBadge,
  };
}

export type ProductDetailModel = ReturnType<typeof useProductDetail>;
