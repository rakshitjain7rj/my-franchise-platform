"use client";

import React from "react";
import Link from "next/link";

type FlavorItem = {
  name: string;
  imageSrc: string;
  href: string;
};

const flavors: FlavorItem[] = [
  {
    name: "Eggless Red Velvet",
    imageSrc: "/images/flavors/red-velvet.png",
    href: "/cake-catalogue?flavour=red-velvet",
  },
  {
    name: "Eggless Chocolate",
    imageSrc: "/images/flavors/dark-truffle.png",
    href: "/cake-catalogue?flavour=chocolate",
  },
  {
    name: "Eggless Vanilla",
    imageSrc: "/images/flavors/madagascar-vanilla.png",
    href: "/cake-catalogue?flavour=victoria",
  },
  {
    name: "Blueberry Silk",
    imageSrc: "/images/flavors/blueberry-silk.png",
    href: "/cake-catalogue?q=blueberry",
  },
  {
    name: "Summer Harvest",
    imageSrc: "/images/flavors/summer-harvest.png",
    href: "/cake-catalogue?cats=round-cakes",
  },
  {
    name: "Gold Butterscotch",
    imageSrc: "/images/flavors/gold-butterscotch.png",
    href: "/cake-catalogue?q=caramel",
  },
];

export default function CuratedByFlavor() {
  return (
    <section className="space-y-8" aria-label="Curated by Flavor">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-outline-variant/20 pb-4">
        <h2 className="font-headline text-2xl md:text-3xl font-extrabold text-deep-plum">
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

      {/* Flavors Grid */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-6 md:gap-8 justify-items-center">
        {flavors.map((flavor, index) => (
          <Link
            key={index}
            href={flavor.href}
            className="group flex flex-col items-center space-y-3 focus:outline-none"
          >
            {/* Circle Image Wrapper */}
            <div
              className="
                w-24 h-24 md:w-28 md:h-28
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
                alt={flavor.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                src={flavor.imageSrc}
              />
            </div>

            {/* Label */}
            <span
              className="
                font-label-bold text-xs text-deep-plum text-center
                group-hover:text-vibrant-magenta
                transition-colors duration-200
                tracking-wide
              "
            >
              {flavor.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
