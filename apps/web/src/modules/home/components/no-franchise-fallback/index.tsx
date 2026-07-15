/**
 * NoFranchiseFallback
 *
 * Displayed on the home page when no `franchise_id` cookie is detected.
 * Guides the user back to the /map-routing location picker.
 *
 * This is a Client Component so it can drive the countdown timer and
 * programmatic redirect via `useRouter`.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface NoFranchiseFallbackProps {
  /** If true, automatically redirect to /map-routing after `redirectDelay` ms. */
  autoRedirect?: boolean;
  /** Milliseconds before the automatic redirect fires. Default: 4 000 ms. */
  redirectDelay?: number;
}

export default function NoFranchiseFallback({
  autoRedirect = true,
  redirectDelay = 4000,
}: NoFranchiseFallbackProps) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(Math.round(redirectDelay / 1000));

  /* ── Auto-redirect countdown ──────────────────────────────────────── */
  useEffect(() => {
    if (!autoRedirect) return;

    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    const timeout = setTimeout(() => {
      router.push("/map-routing");
    }, redirectDelay);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [autoRedirect, redirectDelay, router]);

  return (
    <section
      className="flex flex-col items-center justify-center py-32 px-6 text-center space-y-10"
      aria-label="No bakery selected"
    >
      {/* Animated storefront icon */}
      <div className="relative">
        <div className="absolute inset-0 m-auto w-24 h-24 rounded-full bg-vibrant-magenta/10 animate-ping" />
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-deep-plum to-vibrant-magenta flex items-center justify-center premium-shadow">
          <span className="material-symbols-outlined text-white !text-[44px]">
            storefront
          </span>
        </div>
      </div>

      {/* Headline & body */}
      <div className="space-y-3 max-w-lg">
        <h2 className="font-headline-xl text-3xl md:text-4xl text-deep-plum leading-tight">
          Choose Your Bakery First
        </h2>
        <p className="font-body-lg text-on-surface-variant text-base leading-relaxed">
          Our artisan collections are curated per location. Select your nearest
          bakery to unlock the full catalog handcrafted exclusively for you.
        </p>
      </div>

      {/* Primary CTA */}
      <div className="flex flex-col items-center gap-4">
        <a
          href="/map-routing"
          id="no-franchise-select-bakery-cta"
          className="group inline-flex items-center gap-3 px-10 py-4 bg-deep-plum text-white rounded-full font-label-bold text-sm uppercase tracking-widest hover:bg-vibrant-magenta transition-all duration-300 active:scale-95 premium-shadow"
        >
          <span className="material-symbols-outlined !text-[20px] group-hover:scale-110 transition-transform">
            map
          </span>
          Select Your Location
        </a>

        {autoRedirect && (
          <p className="text-on-surface-variant text-xs font-label-bold tracking-widest uppercase">
            Redirecting automatically in{" "}
            <span className="text-vibrant-magenta tabular-nums">{countdown}s</span>
            …
          </p>
        )}
      </div>

      {/* Decorative category pills */}
      <div className="flex flex-wrap justify-center gap-3 pt-2 opacity-50">
        {[
          "Artisan Cakes",
          "Custom Orders",
          "Same-Day Delivery",
          "Local Flavours",
        ].map((tag) => (
          <span
            key={tag}
            className="px-4 py-1.5 rounded-full border border-deep-plum/20 text-deep-plum text-xs font-label-bold tracking-wide"
          >
            {tag}
          </span>
        ))}
      </div>
    </section>
  );
}
