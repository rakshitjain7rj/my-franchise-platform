"use client";

import React from "react";
import Link from "next/link";

export type FlavourItem = {
  id: string;
  name: string;
  handle: string;
  imageSrc: string;
  href: string;
};

/**
 * Canonical sponge flavours from the live catalogue
 * (`FLAVOUR_OPTIONS` / product Sponge option values).
 * Images are local studio assets under /images/flavors/.
 */
export const SPONGE_FLAVOURS: FlavourItem[] = [
  {
    id: "sponge-chocolate",
    name: "Eggless Chocolate",
    handle: "chocolate",
    imageSrc: "/images/flavors/eggless-chocolate.jpg",
    href: "/cake-catalogue?flavour=chocolate",
  },
  {
    id: "sponge-vanilla",
    name: "Eggless Vanilla",
    handle: "victoria",
    imageSrc: "/images/flavors/eggless-vanilla.jpg",
    href: "/cake-catalogue?flavour=victoria",
  },
  {
    id: "sponge-red-velvet",
    name: "Eggless Red Velvet",
    handle: "red-velvet",
    imageSrc: "/images/flavors/eggless-red-velvet.jpg",
    href: "/cake-catalogue?flavour=red-velvet",
  },
];

/** @deprecated Use FlavourItem */
export type CategoryItem = FlavourItem;

type CuratedByFlavorProps = {
  /** Optional override; defaults to the three live sponge flavours. */
  flavours?: FlavourItem[];
  /** @deprecated Use `flavours` */
  categories?: FlavourItem[];
};

export default function CuratedByFlavor({
  flavours,
  categories,
}: CuratedByFlavorProps) {
  const items =
    flavours && flavours.length > 0
      ? flavours
      : categories && categories.length > 0
        ? categories
        : SPONGE_FLAVOURS;

  return (
    <section className="space-y-8" aria-label="Curated by Flavor">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-outline-variant/20 pb-4">
        <h2 className="font-headline text-xl sm:text-2xl md:text-3xl font-extrabold text-deep-plum">
          Curated by Flavor
        </h2>
        <Link
          href="/cake-catalogue"
          className="group flex items-center gap-1.5 text-vibrant-magenta font-label-bold text-xs uppercase tracking-widest hover:text-deep-plum transition-colors"
        >
          Discover More
          <span className="material-symbols-outlined !text-[16px] group-hover:translate-x-1 transition-transform">
            arrow_forward
          </span>
        </Link>
      </div>

      {/* Sponge flavour circles — 3 live options, centred */}
      <div className="grid grid-cols-3 gap-3 sm:gap-6 md:gap-10 max-w-xl mx-auto justify-items-center">
        {items.map((flavour) => (
          <Link
            key={flavour.id}
            href={flavour.href}
            className="group flex flex-col items-center space-y-2 sm:space-y-3 focus:outline-none"
          >
            <div
              className="
                w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32
                rounded-full
                overflow-hidden
                border-2 border-white
                bg-white
                shadow-[0_8px_24px_-8px_rgba(74,21,75,0.15)]
                group-hover:shadow-[0_12px_32px_-6px_rgba(255,105,180,0.3)]
                group-hover:border-vibrant-magenta
                transition-all duration-300
                relative
              "
            >
              <img
                alt={flavour.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                src={flavour.imageSrc}
              />
            </div>

            <span
              className="
                font-label-bold text-[10px] sm:text-xs text-deep-plum text-center
                group-hover:text-vibrant-magenta
                transition-colors duration-200
                tracking-wide
                leading-tight
              "
            >
              {flavour.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
