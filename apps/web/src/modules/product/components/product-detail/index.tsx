"use client";

import Link from "next/link";
import ImageGallery from "../image-gallery";
import ProductReviewsSection from "../reviews/product-reviews-section";
import {
  ProductDescription,
} from "./product-description";
import { ProductInfoCards } from "./product-info-cards";
import { PurchasePanel } from "./purchase-panel";
import { useProductDetail } from "./use-product-detail";
import type { DietaryTag, MedusaProduct, ProductDetailProps } from "./types";
import {
  getProductCareNotices,
  PRODUCT_ACCESSORIES_NOTE,
} from "@/lib/product-care-notices";

export type { DietaryTag, MedusaProduct, ProductDetailProps };

export default function ProductDetail({
  product,
  dietaryTags = [],
  dietaryBadgesSlot,
  dietaryInfoSlot,
}: ProductDetailProps) {
  const model = useProductDetail(product);
  const {
    galleryImages,
    fullDescription,
    allergenLabels,
    ingredientsText,
    storageText,
    handleReviewBadge,
  } = model;

  const careNotices = getProductCareNotices({
    title: product.title,
    handle: product.handle,
    metadata: product.metadata as Record<string, unknown> | null,
    collection: product.collection,
    type: product.type,
    categories: product.categories,
  });

  // Primary category for back-link + breadcrumb (first linked category).
  const primaryCategory = product.categories?.[0] ?? null;
  const catalogueHref = primaryCategory?.handle
    ? `/cake-catalogue?cats=${encodeURIComponent(primaryCategory.handle)}`
    : "/cake-catalogue";
  const backLabel = primaryCategory?.name
    ? `Back to ${primaryCategory.name}`
    : "Back to cakes";

  return (
    <div className="space-y-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <Link
          href={catalogueHref}
          className="inline-flex items-center gap-1.5 text-xs font-label-bold tracking-wider uppercase text-on-surface-variant hover:text-deep-plum transition-colors shrink-0"
        >
          <span aria-hidden="true">←</span>
          {backLabel}
        </Link>

        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs font-label-bold tracking-wider uppercase text-on-surface-variant min-w-0 sm:justify-end"
        >
          <Link href="/" className="hover:text-deep-plum transition-colors shrink-0">
            Home
          </Link>
          <span className="text-outline-variant shrink-0">/</span>
          <Link
            href="/cake-catalogue"
            className="hover:text-deep-plum transition-colors shrink-0"
          >
            Cakes
          </Link>
          {primaryCategory && (
            <>
              <span className="text-outline-variant shrink-0">/</span>
              <Link
                href={catalogueHref}
                className="hover:text-deep-plum transition-colors truncate max-w-[140px]"
              >
                {primaryCategory.name}
              </Link>
            </>
          )}
          <span className="text-outline-variant shrink-0">/</span>
          <span
            className="text-deep-plum truncate max-w-[200px]"
            aria-current="page"
          >
            {product.title}
          </span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-10 lg:gap-16">
        <div className="space-y-6">
          <div className="space-y-2.5">
            <ImageGallery images={galleryImages} productTitle={product.title} />
            <p
              className="px-0.5 text-xs leading-relaxed text-on-surface-variant sm:text-[13px]"
              role="note"
            >
              {PRODUCT_ACCESSORIES_NOTE}
            </p>
          </div>

          {fullDescription && (
            <ProductDescription
              description={fullDescription}
              className="hidden lg:block"
              headingId="product-description-heading-desktop"
            />
          )}
        </div>

        <PurchasePanel
          product={product}
          dietaryTags={dietaryTags}
          dietaryBadgesSlot={dietaryBadgesSlot}
          model={model}
        />

        {fullDescription && (
          <div className="lg:hidden">
            <ProductDescription
              description={fullDescription}
              headingId="product-description-heading-mobile"
            />
          </div>
        )}
      </div>

      <ProductInfoCards
        ingredientsText={ingredientsText}
        allergenLabels={allergenLabels}
        storageText={storageText}
        dietaryTags={dietaryTags}
        dietaryInfoSlot={dietaryInfoSlot}
        careNotices={careNotices}
      />

      <ProductReviewsSection
        productId={product.id}
        productTitle={product.title}
        onBadgeReady={handleReviewBadge}
      />
    </div>
  );
}
