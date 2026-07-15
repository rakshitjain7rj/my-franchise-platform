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
import { Plus, Minus, ShoppingBag, AlertTriangle, Heart, MapPin } from "lucide-react";
import Link from "next/link";
import ImageGallery from "../image-gallery";
import PhotoUpload from "../photo-upload";
import ProductReviewsSection from "../reviews/product-reviews-section";
import TimeSlotPicker, {
  type SlotSelection,
} from "@/components/time-slot-picker";
import { PremiumSelect } from "@/components/ui/premium-select";
import { useCart } from "@/lib/cart/cart-context";
import { medusaFetch } from "@/lib/medusa";
import {
  FRANCHISE_COOKIE,
  setPersistentCookie,
  STORE_ID_COOKIE,
  STORE_NAME_COOKIE,
} from "@/lib/store-cookies";
import { addToWishlist, removeFromWishlist, isInWishlist } from "@/lib/wishlist";
import { defaultMinCollectionDate } from "@/lib/data/logistics";
import {
  INSCRIPTION_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
  buildCustomAttributes,
  isFlavourOptionTitle,
  isTruthyMetaFlag,
  resolveAllergenLabels,
  resolveIngredientsText,
  resolveServingsForVariant,
  resolveStorageServingText,
  resolveSupportedFlavours,
} from "@/types/cake-metadata";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

type StoreLocationOption = {
  id: string;
  name: string;
  address?: string | null;
  is_default?: boolean;
};

// ---------------------------------------------------------------------------
// Types (mirrors the Medusa Store API shape)
// ---------------------------------------------------------------------------

interface ProductImage {
  url: string;
  id?: string;
}

interface MoneyAmount {
  amount: number;
  currency_code: string;
}

interface CalculatedPrice {
  calculated_amount: number;
  original_amount?: number;
  currency_code: string;
}

interface PriceSet {
  id: string;
  money_amounts?: MoneyAmount[];
}

interface ProductVariant {
  id: string;
  title: string;
  sku?: string;
  calculated_price?: CalculatedPrice;
  prices?: MoneyAmount[];
  price_set?: PriceSet;
  options?: Array<{
    id: string;
    value: string;
    option_id?: string;
    option?: {
      id: string;
      title: string;
    };
  }>;
  inventory_quantity?: number;
  manage_inventory?: boolean;
  metadata?: Record<string, unknown> | null;
}

interface ProductOption {
  id: string;
  title: string;
  values: Array<{
    id: string;
    value: string;
  }>;
}

export interface DietaryTag {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  is_active?: boolean;
}

export interface MedusaProduct {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  subtitle: string | null;
  thumbnail: string | null;
  images: ProductImage[];
  variants: ProductVariant[];
  options: ProductOption[];
  material?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: Array<{ id: string; value: string }>;
  collection?: { id: string; title: string; handle: string } | null;
  type?: { id: string; value: string } | null;
}

interface ProductDetailProps {
  product: MedusaProduct;
  /** From product-dietary-tag relation (server-fetched). */
  dietaryTags?: DietaryTag[];
}

// ---------------------------------------------------------------------------
// Price formatting
// ---------------------------------------------------------------------------

function formatPrice(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode?.toUpperCase() ?? "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getVariantPrice(variant: ProductVariant): {
  current: string;
  original: string | null;
  hasDiscount: boolean;
} | null {
  const calc = variant.calculated_price;
  if (calc) {
    const current = formatPrice(calc.calculated_amount, calc.currency_code);
    const hasDiscount =
      calc.original_amount != null &&
      calc.original_amount > calc.calculated_amount;
    const original = hasDiscount
      ? formatPrice(calc.original_amount!, calc.currency_code)
      : null;
    return { current, original, hasDiscount };
  }

  const price =
    variant.prices?.[0] ?? variant.price_set?.money_amounts?.[0];
  if (price) {
    return {
      current: formatPrice(price.amount, price.currency_code),
      original: null,
      hasDiscount: false,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const GlutenIcon = () => (
  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M12 3c-1.5 2-3 4-3 7s1.5 5 3 7M12 3c1.5 2 3 4 3 7s-1.5 5-3 7M9 7h6M8 12h8M9 17h6" />
  </svg>
);

const DairyIcon = () => (
  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21.5c-3.3 0-6-2.7-6-6 0-3.5 3.5-7.5 6-9.5 2.5 2 6 6 6 9.5 0 3.3-2.7 6-6 6zm0-13v10" />
  </svg>
);

const NutsIcon = () => (
  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2c2.5 0 4.5 2 4.5 4.5S14.5 11 12 11 7.5 9 7.5 6.5 9.5 2 12 2zm0 9c-3 0-6 2.5-6 5.5s2.5 5.5 6 5.5 6-2.5 6-5.5-3-5.5-6-5.5z" />
  </svg>
);

const EggIcon = () => (
  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.5 2 6 6.5 6 11.5c0 4.5 2.5 8.5 6 8.5s6-4 6-8.5C18 6.5 15.5 2 12 2z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5a2.5 2.5 0 0 0-2.5 2.5" />
  </svg>
);

const SoyIcon = () => (
  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-1.2 0-2.4.6-3.2 1.6C8 5.6 7.6 7 7.6 8.4c0 3.3 2 5.6 4.4 5.6s4.4-2.3 4.4-5.6c0-1.4-.4-2.8-1.2-3.8C14.4 3.6 13.2 3 12 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14v6m-3 0h6" />
  </svg>
);

const GenericAllergenIcon = () => (
  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-4 h-4 text-vibrant-magenta shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const ServingsIcon = () => (
  <svg className="w-4 h-4 text-vibrant-magenta shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const FlavorIcon = () => (
  <svg className="w-4 h-4 text-vibrant-magenta shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a9 9 0 0 1 9 9v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-1a9 9 0 0 1 9-9z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v5m-4 0h8" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-4 h-4 text-vibrant-magenta shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4 text-vibrant-magenta shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

function getAllergenIcon(allergen: string) {
  const norm = allergen.toLowerCase().trim();
  if (norm.includes("gluten") || norm.includes("wheat")) return <GlutenIcon />;
  if (norm.includes("dairy") || norm.includes("milk") || norm.includes("lactose")) return <DairyIcon />;
  if (norm.includes("nut")) return <NutsIcon />;
  if (norm.includes("egg")) return <EggIcon />;
  if (norm.includes("soy") || norm.includes("soya")) return <SoyIcon />;
  return <GenericAllergenIcon />;
}

/**
 * Pick the longest useful product blurb for display.
 * Many Magento imports only stored a short overview/title; longer marketing
 * copy often lives in metadata from the live scrape.
 */
function resolveFullProductDescription(product: MedusaProduct): string {
  const title = (product.title || "").trim()
  const titleBare = title.replace(/^\([^)]+\)\s*/, "").trim()
  const meta = product.metadata ?? {}

  const candidates = [
    product.description,
    typeof meta.scraped_meta_description === "string"
      ? meta.scraped_meta_description
      : null,
    typeof meta.scraped_overview === "string" ? meta.scraped_overview : null,
    product.subtitle,
  ]
    .map((s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : ""))
    .filter((s) => {
      if (!s || s.length < 20) return false
      if (/^allergens?\s*:/i.test(s)) return false
      if (s === title || s === titleBare) return false
      return true
    })

  if (!candidates.length) {
    const fallback = (product.description || "").trim()
    return fallback
  }

  candidates.sort((a, b) => b.length - a.length)
  return candidates[0]
}

/** Full product description — under the gallery on desktop; after CTA on mobile. */
function ProductDescription({
  description,
  className = "",
  headingId = "product-description-heading",
}: {
  description: string;
  className?: string;
  headingId?: string;
}) {
  // Magento copy is often one long line; split into readable paragraphs.
  const normalized = description.trim().replace(/\s+/g, " ")
  const paragraphs = normalized
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((para) => para.trim())
    .filter(Boolean)

  // If sentence-split produced nothing useful, fall back to whole blob / newlines
  const blocks =
    paragraphs.length > 0
      ? paragraphs
      : description
          .trim()
          .split(/\n+/)
          .map((para) => para.trim())
          .filter(Boolean)

  if (!blocks.length) return null

  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-3xl border border-outline-variant/20 bg-[#FBF5FB] p-6 md:p-8 shadow-sm ${className}`}
    >
      <h2
        id={headingId}
        className="font-headline-md text-sm uppercase tracking-[0.18em] text-deep-plum mb-4"
      >
        About this cake
      </h2>
      <div className="space-y-4 font-body-md text-on-surface leading-relaxed text-base md:text-[17px]">
        {blocks.map((para, i) => (
          <p key={i} className="text-pretty">
            {para}
          </p>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProductDetail({
  product,
  dietaryTags = [],
}: ProductDetailProps) {
  const router = useRouter();

  // Product options that are real Medusa variants (Size, Flavor when option-driven)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
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

  // Metadata-driven flavour when product has no Flavor option
  const [metadataFlavour, setMetadataFlavour] = useState(
    () => metadataFlavours[0] ?? ""
  );

  const [collectionDate, setCollectionDate] = useState(defaultMinCollectionDate());
  const [collectionTime, setCollectionTime] = useState(""); // HH:mm slot start
  const [collectionTimeLabel, setCollectionTimeLabel] = useState("");
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
  const [storeLocationId, setStoreLocationId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [storeLocations, setStoreLocations] = useState<StoreLocationOption[]>(
    []
  );
  const [storesLoading, setStoresLoading] = useState(true);
  const storeLocationIdRef = useRef<string | null>(null);

  const { addToCart } = useCart();

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
    return () => window.removeEventListener("wishlist-updated", handleWishlistUpdate);
  }, [product.id]);

  // Keep a ref in sync so the store-selection event handler can detect real changes.
  useEffect(() => {
    storeLocationIdRef.current = storeLocationId;
  }, [storeLocationId]);

  // Sync store selection from cookies + external pickers (header / map / bootstrap)
  useEffect(() => {
    const initialId = getCookie(STORE_ID_COOKIE);
    const initialName = getCookie(STORE_NAME_COOKIE);
    setStoreLocationId(initialId);
    setStoreName(initialName);
    storeLocationIdRef.current = initialId;

    const onStoreChanged = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          storeLocationId?: string;
          storeName?: string;
          source?: string;
        }>
      ).detail;

      // Our own dropdown already updated state, cookies, slots, and refresh.
      if (detail?.source === "product-detail") return;

      const nextId = detail?.storeLocationId ?? getCookie(STORE_ID_COOKIE);
      const nextName = detail?.storeName ?? getCookie(STORE_NAME_COOKIE);
      const changed =
        Boolean(nextId) && nextId !== storeLocationIdRef.current;

      setStoreLocationId(nextId);
      setStoreName(nextName);
      storeLocationIdRef.current = nextId;

      if (changed) {
        setCollectionTime("");
        setCollectionTimeLabel("");
        router.refresh();
      }
    };

    window.addEventListener("store-selection-changed", onStoreChanged);
    return () =>
      window.removeEventListener("store-selection-changed", onStoreChanged);
  }, [router]);

  // Load franchise store locations for the in-page switcher
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const franchiseId = getCookie(FRANCHISE_COOKIE)?.trim();
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

      // If cookies lag behind (e.g. only id set), hydrate the display name.
      const currentId = getCookie(STORE_ID_COOKIE);
      if (currentId && !getCookie(STORE_NAME_COOKIE)) {
        const match = locations.find((l) => l.id === currentId);
        if (match?.name) {
          setStoreName(match.name);
          setPersistentCookie(STORE_NAME_COOKIE, match.name);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const storeSelectOptions = useMemo(() => {
    const opts = storeLocations.map((loc) => ({
      value: loc.id,
      label: loc.name,
      description: loc.address?.trim() || undefined,
    }));
    // Keep a stale cookie selection visible until locations finish loading
    // or if it is missing from the franchise list for any reason.
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

      setPersistentCookie(STORE_ID_COOKIE, nextStoreId);
      setPersistentCookie(STORE_NAME_COOKIE, nextName);
      setStoreLocationId(nextStoreId);
      setStoreName(nextName);
      storeLocationIdRef.current = nextStoreId;
      setShowLocationModal(false);
      setCartError(null);
      // Slots are store-specific — force a fresh pick.
      setCollectionTime("");
      setCollectionTimeLabel("");

      try {
        window.dispatchEvent(
          new CustomEvent("store-selection-changed", {
            detail: {
              storeLocationId: nextStoreId,
              storeName: nextName,
              source: "product-detail",
            },
          })
        );
      } catch {
        // ignore
      }

      // Re-fetch product inventory scoped to the new bakery.
      router.refresh();
    },
    [storeLocationId, storeLocations, router]
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

  // Keep metadata flavour in sync if options resolve after mount
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

  /** Servings derived from variant metadata / product servings_map — not a free select. */
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

  // Non-flavour Medusa options (Size, etc.) rendered as selectors
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

    const activeStoreId = storeLocationId ?? getCookie(STORE_ID_COOKIE);
    if (!activeStoreId) {
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
      // Extra options = product options except flavour (mapped to canonical key)
      const extraOptions: Record<string, string> = {};
      for (const [title, value] of Object.entries(selectedOptions)) {
        if (isFlavourOptionTitle(title)) continue;
        extraOptions[title] = value;
      }

      const customAttributes = buildCustomAttributes({
        flavour: resolvedFlavour || undefined,
        servings: servingsLabel || undefined,
        date: collectionDate,
        time: collectionTimeLabel || collectionTime,
        message: specialMessage.trim() || undefined,
        photo_url: photoUrl || undefined,
        extraOptions,
      });

      await addToCart({
        variantId: activeVariant.id,
        quantity,
        storeLocationId: activeStoreId,
        customAttributes,
        inscription: supportsInscription
          ? inscription.trim() || undefined
          : undefined,
        // Cart-level metadata so cart/checkout pickers hydrate the same slot
        // (line-item custom_attributes alone do not drive the cart scheduler).
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
    specialMessage,
    photoUrl,
    resolvedFlavour,
    servingsLabel,
    supportsInscription,
    storeLocationId,
    addToCart,
  ]);

  // Dietary tags (Eggless, Vegan…) are positive claims shown as green badges.
  // Allergens come from product.metadata.allergens and are shown alongside them.
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

  return (
    <div className="space-y-12">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs font-label-bold tracking-wider uppercase text-on-surface-variant"
      >
        <Link href="/" className="hover:text-deep-plum transition-colors">
          Home
        </Link>
        <span className="text-outline-variant">/</span>
        {product.collection && (
          <>
            <span className="text-on-surface-variant">
              {product.collection.title}
            </span>
            <span className="text-outline-variant">/</span>
          </>
        )}
        <span className="text-deep-plum truncate max-w-[200px]">
          {product.title}
        </span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-10 lg:gap-16">
        {/* Left: gallery + full description under the image (desktop).
            On mobile the same block is repeated below the buy form so
            title/price/CTA stay above the long copy. */}
        <div className="space-y-6">
          <ImageGallery images={galleryImages} productTitle={product.title} />

          {fullDescription && (
            <ProductDescription
              description={fullDescription}
              className="hidden lg:block"
              headingId="product-description-heading-desktop"
            />
          )}
        </div>

        <div className="flex flex-col space-y-6">
          {/* Title */}
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

            {/* Review rating badge (scrolls to reviews section) */}
            {reviewBadge && <div className="pt-1">{reviewBadge}</div>}

            {/* Dietary tag badges (product-dietary-tag relation) */}
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

          {/* Price */}
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

          {/* ── Customize ───────────────────────────────────────────────── */}
          <div className="space-y-4">
            <h3 className="font-label-bold text-xl text-deep-plum uppercase tracking-widest">
              Customize Your Cake
            </h3>

            {/* Collection bakery — change store without leaving the product page */}
            <div className="flex flex-col gap-2 bg-white p-3.5 rounded-2xl border border-outline-variant/30 transition-all duration-300">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-vibrant-magenta">
                  <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                  <span className="text-xs font-bold text-on-surface-variant/90 uppercase tracking-wider">
                    Collection bakery
                  </span>
                </div>
                {storeLocations.length > 1 && (
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

            {/* Medusa product options (Size, Flavor-as-option, …) */}
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

            {/* Live bakery slots */}
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
                  setCollectionTime("");
                  setCollectionTimeLabel("");
                }}
                onSlotChange={handleSlotChange}
                compact
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Metadata-driven sponge flavour (when not a Medusa option) */}
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

              {/* Derived servings (read-only when no size option to host the hint) */}
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

            {/* Inscription — cake surface text (100 ch) */}
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

            {/* Special instructions — baker notes (200 ch) */}
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

            {/* Photo upload for edible photo cakes */}
            {supportsPhotoUpload && (
              <PhotoUpload
                value={photoUrl}
                onChange={setPhotoUrl}
                disabled={isAddingToCart}
              />
            )}
          </div>

          {/* Location missing modal */}
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

          {/* Quantity + Add to Cart + Wishlist */}
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

        {/* Mobile: full description after the buy column (desktop uses left column) */}
        {fullDescription && (
          <div className="lg:hidden">
            <ProductDescription
              description={fullDescription}
              headingId="product-description-heading-mobile"
            />
          </div>
        )}
      </div>

      {/* ── Info cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[35%_30%_35%] gap-4 pt-10 border-t border-outline-variant/20">
        {/* Ingredients */}
        <div className="bg-[#FBF5FB] border border-outline-variant/20 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 text-deep-plum font-bold">
            <svg className="w-5 h-5 text-deep-plum" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-lg font-headline-md uppercase tracking-wider">
              Ingredients
            </span>
          </div>
          <div className="flex flex-col gap-2.5 pt-1">
            {ingredientsText ? (
              ingredientsText
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 8)
                .map((ingredient, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 text-on-surface-variant text-sm font-medium"
                  >
                    <CheckIcon />
                    <span className="truncate">{ingredient}</span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-on-surface-variant">
                Ingredient details are being updated for this cake.
              </p>
            )}
          </div>
        </div>

        {/* Food Allergens + dietary tags */}
        <div className="bg-[#FFF0F8] border border-outline-variant/20 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 text-[#ac2471] font-bold">
            <AlertTriangle className="w-5 h-5 text-[#ac2471]" />
            <span className="text-lg font-headline-md uppercase tracking-wider">
              Dietary & Allergens
            </span>
          </div>
          <div className="flex flex-col gap-2.5 pt-1">
            {dietaryTags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center gap-3 bg-white border border-emerald-200/60 rounded-2xl p-3 shadow-sm text-emerald-800 text-sm font-semibold"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 shrink-0">
                  <CheckIcon />
                </div>
                <div className="min-w-0">
                  <span>{tag.name}</span>
                  {tag.description && (
                    <p className="text-xs font-normal text-on-surface-variant truncate">
                      {tag.description}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {allergenLabels.slice(0, 6).map((allergen) => (
              <div
                key={allergen}
                className="flex items-center gap-3 bg-white border border-outline-variant/20 rounded-2xl p-3 shadow-sm text-slate-700 text-sm font-semibold transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#FFF0F8] shrink-0">
                  {getAllergenIcon(allergen)}
                </div>
                <span>{allergen}</span>
              </div>
            ))}

            {dietaryTags.length === 0 && allergenLabels.length === 0 && (
              <p className="text-sm text-on-surface-variant">
                Allergen information is available on request — please add a note
                in Special Instructions or contact your local bakery.
              </p>
            )}
          </div>
        </div>

        {/* Storage & Serving */}
        <div className="bg-[#F8F0FC] border border-outline-variant/20 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 text-deep-plum font-bold">
            <svg className="w-5 h-5 text-deep-plum" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-lg font-headline-md uppercase tracking-wider">
              Storage & Serving
            </span>
          </div>
          <p className="font-body-md text-on-surface-variant leading-relaxed text-sm">
            {storageText ||
              "Keep refrigerated and consume within 3 days. For best flavour, remove from the fridge 30–45 minutes before serving."}
          </p>
        </div>
      </div>

      {/* Customer reviews — badge under title is populated via onBadgeReady */}
      <ProductReviewsSection
        productId={product.id}
        productTitle={product.title}
        onBadgeReady={handleReviewBadge}
      />
    </div>
  );
}
