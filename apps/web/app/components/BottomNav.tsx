"use client";

/**
 * BottomNav — Mobile-only bottom navigation bar.
 *
 * - Fixed at the bottom of every page EXCEPT /map-routing.
 * - Active tab is detected via `usePathname()`.
 * - Cart badge shows item count when > 0.
 * - Hidden on desktop (md:hidden).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart/cart-context";

// ─── Tab definitions ──────────────────────────────────────────────────────────

interface Tab {
  label: string;
  href: string;
  icon: string; // Material Symbols icon name
  exactMatch?: boolean;
}

const TABS: Tab[] = [
  { label: "Home", href: "/", icon: "home", exactMatch: true },
  { label: "Cakes", href: "/cake-catalogue", icon: "cake" },
  { label: "Cart", href: "/cart", icon: "shopping_cart" },
  { label: "Account", href: "/account", icon: "account_circle" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const pathname = usePathname();
  const { totalItems } = useCart();

  // Hide entirely on the map-routing page (it has its own full-screen layout)
  if (pathname === "/map-routing" || pathname.startsWith("/map-routing/")) {
    return null;
  }

  function isActive(tab: Tab): boolean {
    if (tab.exactMatch) return pathname === tab.href;
    return pathname.startsWith(tab.href);
  }

  return (
    <>
      {/* ── Keyframe animations ─────────────────────────────────────────────── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes badgePop {
          0%   { transform: scale(0.5); opacity: 0; }
          70%  { transform: scale(1.15); }
          100% { transform: scale(1);   opacity: 1; }
        }
        .badge-pop { animation: badgePop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `,
        }}
      />

      {/*
        Frosted surface bar — boutique, elevated, and readable over lavender pages.
        safe-area padding clears the iOS home indicator on notched devices.
      */}
      <nav
        aria-label="Mobile navigation"
        className="
          fixed bottom-0 inset-x-0
          md:hidden
          z-[1000]
          bg-white/92 backdrop-blur-xl
          border-t border-outline-variant/40
          shadow-[0_-6px_28px_rgba(74,21,75,0.08)]
        "
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex w-full max-w-lg h-[4.25rem] px-1.5">
          {TABS.map((tab) => {
            const active = isActive(tab);
            const isCart = tab.href === "/cart";

            return (
              <Link
                key={tab.href}
                href={tab.href}
                id={`bottom-nav-${tab.label.toLowerCase()}`}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                className="
                  relative flex flex-1 flex-col items-center justify-center
                  select-none
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deep-plum/30 focus-visible:ring-inset
                "
              >
                <span
                  className={`
                    relative flex flex-col items-center justify-center gap-0.5
                    min-w-[4.25rem] px-3 py-1.5 rounded-2xl
                    transition-all duration-200 ease-out
                    ${
                      active
                        ? "bg-deep-plum/8 text-deep-plum"
                        : "text-on-surface-variant/75 hover:text-deep-plum/80 active:bg-deep-plum/5"
                    }
                  `}
                >
                  <span className="relative flex items-center justify-center">
                    <span
                      className={`
                        material-symbols-outlined select-none
                        transition-all duration-200
                        ${active ? "!text-[24px]" : "!text-[22px]"}
                      `}
                      style={{
                        fontVariationSettings: active
                          ? "'FILL' 1, 'wght' 500"
                          : "'FILL' 0, 'wght' 400",
                      }}
                      aria-hidden="true"
                    >
                      {tab.icon}
                    </span>

                    {/* Cart item count badge */}
                    {isCart && totalItems > 0 && (
                      <span
                        aria-label={`${totalItems} items in cart`}
                        className="
                          badge-pop
                          absolute -top-1.5 -right-2.5
                          min-w-[16px] h-4 px-1
                          flex items-center justify-center
                          bg-vibrant-magenta text-white
                          text-[9px] font-bold leading-none
                          rounded-full
                          shadow-sm ring-2 ring-white
                        "
                      >
                        {totalItems > 99 ? "99+" : totalItems}
                      </span>
                    )}
                  </span>

                  <span
                    className={`
                      text-[10px] font-semibold tracking-wide leading-none
                      transition-opacity duration-200
                      ${active ? "opacity-100" : "opacity-80"}
                    `}
                  >
                    {tab.label}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
