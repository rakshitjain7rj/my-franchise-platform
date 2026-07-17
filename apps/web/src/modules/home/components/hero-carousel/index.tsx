"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type SlideContent = {
  tag: string;
  title: string;
  titleEmphasis: string;
  description: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  imageSrc: string;
  imageAlt: string;
};

const slides: SlideContent[] = [
  {
    tag: "Seasonal Special",
    title: "Summer",
    titleEmphasis: "Harvest",
    description:
      "Wild forest berries meets whipped mascarpone cream in our lightest, most refreshing creation yet.",
    primaryCta: { label: "Pre-Order Now", href: "#" },
    secondaryCta: { label: "Seasonal Menu", href: "#" },
    imageSrc: "/images/cakes/summer-harvest.png",
    imageAlt: "Summer Harvest Berry Cake",
  },
  {
    tag: "Celebration Ready",
    title: "Curated",
    titleEmphasis: "Dessert Tables",
    description:
      "Turn moments into memories with our exquisite dessert tables and dessert spreads for any occasion.",
    primaryCta: { label: "View Portfolio", href: "#" },
    imageSrc: "/images/cakes/dessert-table.png",
    imageAlt: "Curated Dessert Tables",
  },
];

export default function HeroCarousel() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % slides.length);
    }, 6000); // cycle every 6s

    return () => clearInterval(timer);
  }, []);

  return (
    <section
      className="relative h-[480px] sm:h-[540px] md:h-[620px] rounded-2xl sm:rounded-3xl overflow-hidden premium-shadow bg-lavender-bg"
      id="hero-carousel"
      aria-label="Featured Collections Carousel"
    >
      {slides.map((slide, idx) => {
        const isActive = idx === activeIdx;

        return (
          <div
            key={idx}
            className={cn(
              "absolute inset-0 w-full h-full flex flex-col md:flex-row items-end md:items-center transition-all duration-1000 ease-in-out",
              isActive
                ? "opacity-100 translate-x-0 z-10 pointer-events-auto"
                : "opacity-0 translate-x-4 z-0 pointer-events-none"
            )}
          >
            {/* Left side: Content Card */}
            <div className="relative z-20 w-full md:w-[45%] h-auto md:h-full flex items-end md:items-center justify-center p-4 sm:p-6 md:p-12 pb-10 sm:pb-12">
              <div className="bg-white/90 md:bg-white/80 backdrop-blur-xl p-5 sm:p-7 md:p-12 rounded-2xl md:rounded-3xl border border-white/60 shadow-[0_20px_50px_-20px_rgba(74,21,75,0.15)] space-y-3 sm:space-y-5 md:space-y-6 w-full max-w-lg md:-mr-24 relative z-30">
                {/* Badge */}
                <span className="inline-block px-4 py-1.5 rounded-full bg-vibrant-magenta text-white text-[10px] font-label-bold uppercase tracking-widest">
                  {slide.tag}
                </span>

                {/* Title */}
                <h1 className="font-headline text-2xl sm:text-3xl md:text-5xl font-extrabold text-deep-plum leading-[1.1]">
                  {slide.title} <br />
                  <span className="text-vibrant-magenta font-light italic font-serif text-xl sm:text-2xl md:text-4xl block mt-1">
                    {slide.titleEmphasis}
                  </span>
                </h1>

                {/* Description */}
                <p className="font-body text-on-surface-variant text-xs sm:text-sm md:text-base leading-relaxed hidden sm:block">
                  {slide.description}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-3 sm:gap-4 pt-1 sm:pt-2">
                  <a
                    className="bg-vibrant-magenta text-white px-5 sm:px-8 py-2.5 sm:py-3.5 rounded-full font-label-bold text-xs uppercase tracking-widest hover:bg-deep-plum transition-all duration-300 active:scale-95 shadow-md hover:shadow-lg"
                    href={slide.primaryCta.href}
                  >
                    {slide.primaryCta.label}
                  </a>
                  {slide.secondaryCta && (
                    <a
                      className="text-deep-plum font-label-bold text-xs uppercase tracking-widest border-b-2 border-transparent hover:border-deep-plum transition-all pb-0.5 px-1 hidden sm:inline"
                      href={slide.secondaryCta.href}
                    >
                      {slide.secondaryCta.label}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Right side: Image — full bleed behind content on mobile */}
            <div className="w-full md:w-[65%] h-full overflow-hidden absolute md:relative right-0 top-0 -z-0 md:z-0">
              <img
                alt={slide.imageAlt}
                className={cn(
                  "w-full h-full object-cover transition-transform duration-[6000ms] ease-out",
                  isActive ? "scale-100" : "scale-105"
                )}
                src={slide.imageSrc}
              />
              {/* Mobile: gradient from bottom so text card is readable */}
              <div className="absolute inset-0 bg-gradient-to-t from-lavender-bg/80 via-lavender-bg/20 to-transparent pointer-events-none md:hidden" />
              {/* Desktop: gradient from left */}
              <div className="absolute inset-0 bg-gradient-to-r from-lavender-bg/40 via-transparent to-transparent pointer-events-none hidden md:block" />
            </div>
          </div>
        );
      })}

      {/* Pagination indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 md:left-12 md:translate-x-0 z-30 flex gap-2">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIdx(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              idx === activeIdx ? "w-8 bg-vibrant-magenta" : "w-2 bg-deep-plum/30"
            )}
          />
        ))}
      </div>
    </section>
  );
}
