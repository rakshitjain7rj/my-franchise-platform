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
  { label: "Home",    href: "/",               icon: "home",             exactMatch: true },
  { label: "Cakes",   href: "/cake-catalogue",  icon: "cake" },
  { label: "Cart",    href: "/cart",            icon: "shopping_cart" },
  { label: "Account", href: "/account",         icon: "account_circle" },
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
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes badgePop {
          0%   { transform: scale(0.5); opacity: 0; }
          70%  { transform: scale(1.15); }
          100% { transform: scale(1);   opacity: 1; }
        }
        .badge-pop { animation: badgePop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @keyframes tabIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tab-in { animation: tabIn 0.2s ease forwards; }
      `}} />

      {/*
        The nav is md:hidden — on tablet/desktop it never appears.
        safe-area padding ensures it clears the iOS home indicator on notched
        devices (env(safe-area-inset-bottom)).
      */}
      <nav
        aria-label="Mobile navigation"
        className="
          fixed bottom-0 inset-x-0
          md:hidden
          z-[1000]
          bg-[#4A154B]
          border-t border-white/10
          flex items-stretch
        "
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex w-full h-16">
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
                className={`
                  relative flex flex-1 flex-col items-center justify-center gap-0.5
                  transition-all duration-200 select-none
                  ${active
                    ? "text-[#FF69B4]"
                    : "text-white/55 hover:text-white/80 active:text-white"
                  }
                `}
              >
                {/* Active indicator bar at top */}
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-[#FF69B4] tab-in"
                    aria-hidden="true"
                  />
                )}

                {/* Icon wrapper — position:relative so badge can be absolute inside */}
                <span className="relative flex items-center justify-center">
                  <span
                    className={`
                      material-symbols-outlined select-none
                      transition-all duration-200
                      ${active ? "!text-[24px]" : "!text-[22px]"}
                    `}
                    style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
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
                        bg-[#FF2D55] text-white
                        text-[9px] font-bold leading-none
                        rounded-full
                        shadow-sm
                      "
                    >
                      {totalItems > 99 ? "99+" : totalItems}
                    </span>
                  )}
                </span>

                {/* Label */}
                <span
                  className={`
                    text-[10px] font-semibold tracking-wide leading-none
                    transition-all duration-200
                    ${active ? "opacity-100" : "opacity-70"}
                  `}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
