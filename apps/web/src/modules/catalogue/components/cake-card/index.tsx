"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import cakeImage from "../../../../../app/assets/dummy.avif";
import {
  type CatalogueProduct,
  formatVariantPrice,
  getCheapestVariant,
  isProductAvailable,
} from "@/lib/data/catalogue";

interface CakeCardProps {
  product: CatalogueProduct;
  featured?: boolean;
}

export default function CakeCard({ product }: CakeCardProps) {
  const available = isProductAvailable(product);
  const activeVariant = getCheapestVariant(product.variants);
  const priceStr = activeVariant ? formatVariantPrice(activeVariant) : null;
  const imageUrl = product.thumbnail ?? product.images?.[0]?.url;
  const categoryLabel = product.categories?.[0]?.name ?? null;

  // Clean product codes like "(R1) Simple Fresh Cream Cake" → title + code badge
  const codeMatch = product.title.match(/^\(([^)]+)\)\s*(.*)$/);
  const displayTitle = codeMatch?.[2]?.trim() || product.title;
  const productCode = codeMatch?.[1] ?? null;

  return (
    <article
      id={`cake-card-${product.id}`}
      className={`group flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant/40 bg-white shadow-[0_1px_2px_rgba(74,21,75,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-deep-plum/15 hover:shadow-[0_8px_24px_rgba(74,21,75,0.1)] ${
        !available ? "opacity-70" : ""
      }`}
    >
      <Link
        href={`/products/${product.handle}`}
        className="relative block aspect-[5/4] overflow-hidden bg-lavender-bg"
        tabIndex={-1}
        aria-hidden="true"
      >
        <img
          src={imageUrl || cakeImage.src}
          alt={product.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          loading="lazy"
        />

        {/* Soft gradient for badge readability */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/25 to-transparent" />

        {categoryLabel && (
          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-deep-plum shadow-sm backdrop-blur">
            {categoryLabel.replace(/ Cakes?$/i, "")}
          </span>
        )}

        {!available && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <span className="rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
              Unavailable
            </span>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-2.5 sm:p-3">
        {productCode && (
          <span className="mb-0.5 w-fit rounded bg-lavender-bg px-1 py-0.5 font-mono text-[9px] font-semibold tracking-wide text-deep-plum/70">
            {productCode}
          </span>
        )}

        <Link href={`/products/${product.handle}`} className="block">
          <h2 className="line-clamp-2 text-[13px] font-bold leading-snug tracking-tight text-deep-plum transition-colors group-hover:text-vibrant-magenta sm:text-sm">
            {displayTitle}
          </h2>
        </Link>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
          <p className="text-sm font-bold tabular-nums tracking-tight text-deep-plum sm:text-base">
            {priceStr ?? "—"}
          </p>

          <Link
            href={`/products/${product.handle}`}
            id={`cake-order-${product.id}`}
            aria-label={`View ${product.title}`}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-deep-plum px-2.5 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-vibrant-magenta sm:px-3"
          >
            View
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </article>
  );
}
