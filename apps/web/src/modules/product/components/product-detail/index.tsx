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

export type { DietaryTag, MedusaProduct, ProductDetailProps };

export default function ProductDetail({
  product,
  dietaryTags = [],
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

  return (
    <div className="space-y-12">
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

        <PurchasePanel
          product={product}
          dietaryTags={dietaryTags}
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
      />

      <ProductReviewsSection
        productId={product.id}
        productTitle={product.title}
        onBadgeReady={handleReviewBadge}
      />
    </div>
  );
}
