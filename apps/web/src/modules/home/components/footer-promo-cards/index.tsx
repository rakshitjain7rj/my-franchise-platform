"use client";

import React from "react";

export default function FooterPromoCards() {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter">
      {/* Loyalty Progress Card (1/3 width) */}
      <div
        className="
          lg:col-span-1
          bg-deep-plum
          p-8 md:p-10
          rounded-3xl
          premium-shadow
          flex flex-col justify-between
          text-white
          relative
          overflow-hidden
          group
          min-h-[280px]
        "
      >
        {/* Card Content */}
        <div className="relative z-10 space-y-6">
          <div className="space-y-2">
            <span className="inline-block px-3 py-1 rounded-full bg-vibrant-magenta/20 text-vibrant-magenta text-[9px] font-label-bold uppercase tracking-widest">
              The Connoisseur Club
            </span>
            <h3 className="font-headline text-lg md:text-xl font-bold leading-tight">
              Sweet Rewards
            </h3>
          </div>
          <p className="opacity-80 font-body text-xs md:text-sm leading-relaxed max-w-[240px]">
            Exclusive benefits for our patrons. You&apos;re 200 points away from a{" "}
            <span className="font-bold border-b border-vibrant-magenta">
              Free Signature Cupcake.
            </span>
          </p>
        </div>

        {/* Big Points counter */}
        <div className="mt-8 relative z-10 flex items-baseline gap-2">
          <span className="text-5xl font-extrabold tracking-tight">1,250</span>
          <span className="text-[10px] font-label-bold uppercase tracking-[0.2em] opacity-60">
            Loyalty Points
          </span>
        </div>

        {/* Decorative background star */}
        <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-vibrant-magenta/10 rounded-full group-hover:scale-110 transition-transform duration-1000" />
      </div>

      {/* Lightning Service Card (2/3 width) */}
      <div
        className="
          lg:col-span-2
          bg-white
          p-6 sm:p-8 md:p-10
          rounded-3xl
          border border-outline-variant/30
          premium-shadow
          flex flex-col sm:flex-row
          gap-6 sm:gap-8 md:gap-12
          items-center
          min-h-[280px]
        "
      >
        {/* Info */}
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 bg-lavender-bg px-4 py-2 rounded-full text-deep-plum font-label-bold text-[10px] uppercase tracking-widest">
            <span className="material-symbols-outlined !text-[16px] text-vibrant-magenta">
              bolt
            </span>
            Lightning Service
          </div>
          <div className="space-y-2">
            <h3 className="font-headline text-2xl font-bold text-deep-plum leading-tight">
              Need it now?
            </h3>
            <p className="text-on-surface-variant font-body text-sm md:text-base leading-relaxed">
              Our white-glove courier service ensures your patisserie arrives in
              pristine condition within 120 minutes across the metropolitan
              area.
            </p>
          </div>
          <a
            className="text-vibrant-magenta font-label-bold text-xs uppercase tracking-widest border-b-2 border-vibrant-magenta/20 hover:border-vibrant-magenta transition-all pb-1 flex items-center gap-2 group w-fit"
            href="#"
          >
            Track Your Order
            <span className="material-symbols-outlined !text-[16px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </a>
        </div>

        {/* Visual Delivery Icon Container */}
        <div className="w-32 h-32 sm:w-48 sm:h-48 bg-[#F8F5FB] rounded-3xl flex items-center justify-center p-6 sm:p-8 border border-outline-variant/10 relative shrink-0">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-md relative">
            <span className="material-symbols-outlined text-vibrant-magenta !text-[36px]">
              local_shipping
            </span>
            {/* Pink notification dot */}
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-vibrant-magenta rounded-full border-2 border-white" />
          </div>
        </div>
      </div>
    </section>
  );
}
