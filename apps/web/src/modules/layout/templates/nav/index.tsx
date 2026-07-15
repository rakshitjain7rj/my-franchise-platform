"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart/cart-context";

export type NavItem = {
  label: string;
  href: string;
  isActive?: boolean;
};

export type StickyNavHeaderProps = {
  navItems?: NavItem[];
  logoSrc?: string;
  logoAlt?: string;
  searchPlaceholder?: string;
  cartCount?: number;
  profileSrc?: string;
};

const defaultNavItems: NavItem[] = [
  { label: "Express Delivery", href: "#", isActive: true },
  { label: "Birthday Collection", href: "#" },
  { label: "Occasion Cakes", href: "#" },
  { label: "Bespoke Designs", href: "#" },
  { label: "Signature Flavors", href: "#" },
  { label: "The Patisserie", href: "#" }
];

export default function StickyNavHeader({
  navItems = defaultNavItems,
  logoSrc =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCj6Yj4Eny7MPK_BVGzJ7vmKQxRPxYlRZLl4bXXvL5KPSW1_-Z4qevXCYVvfYMcvyza1fpXIstDQC7BxPX77L0Jr3c3-q__fXaZ4UB67MMg2CywiifVBTUKWNfk8ObpvNC4GAVfe9DA_h6llKvUOrGISykmC0c4ObaU47mcnPrVnQYEcoTsjuTu2g2ADc-mAH1HsqBl5B7ceJc186WOsAGaFTKDRn9qW0dpKcQ2yl_DSVBWTno0At5DDUdTP3EYa8KbmkmOoU596yO0",
  logoAlt = "Cake Break Logo",
  searchPlaceholder = "Search our collection of fine cakes...",
  cartCount,
  profileSrc =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCdkNpIJM3QV8Geyq8E6_uKjPqGPiBW-LA8WejF8h7C9aemwnIq3fKsODDnsifSR1chHjipZaKdDwczJmWObJYEYc3Frrxj_P-hwfcnxpOSOAFfxgobC4UrAhNnhh6perOv6eWRZeSyR2OIlzCXfRXOob6tmqBdUwRGUInCm4guDSbem3WoulSQ0WWusJjaukn4py492TAj-36EtNGxU1eJ5NpAo7qGj9VdxOVg39bzTXMHu6hqU2mRry4H-ywhF9zkQv_KAt4M2SBk"
}: StickyNavHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const { totalItems } = useCart();
  const liveCount = cartCount ?? totalItems;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <header
      className={`fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-outline-variant/30 ${isScrolled ? "shadow-md" : ""
        }`}
    >
      <div className="flex items-center justify-between px-margin-mobile md:px-margin-desktop h-20 md:h-24 max-w-[1440px] mx-auto">
        <div className="flex-shrink-0">
          <Link href="#" aria-label="Cake Break home">
            <img alt={logoAlt} className="h-10 md:h-12 w-auto" src={logoSrc} />
          </Link>
        </div>
        <div className="hidden md:flex flex-grow max-w-xl mx-12 relative group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-deep-plum transition-colors">
            <span className="material-symbols-outlined !text-[20px]">search</span>
          </span>
          <input
            className="w-full h-11 pl-12 pr-6 rounded-full border border-outline-variant/50 bg-surface-container-lowest focus:border-deep-plum focus:ring-0 outline-none text-sm transition-all placeholder:text-outline/60"
            placeholder={searchPlaceholder}
            type="text"
          />
        </div>
        <div className="flex items-center gap-6 md:gap-8">
          <Link
            href="/map-routing"
            className="hidden lg:flex items-center gap-2 text-on-surface-variant hover:text-deep-plum transition-colors group"
          >
            <span className="material-symbols-outlined !text-[20px]" data-icon="location_on">
              location_on
            </span>
            <span className="font-label-bold text-label-bold">Boutique Finder</span>
          </Link>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-deep-plum hover:bg-lavender-bg/50 rounded-full transition-colors">
              <span className="material-symbols-outlined !text-[24px]" data-icon="notifications">
                notifications
              </span>
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-vibrant-magenta rounded-full"></span>
            </button>
            <Link href="/cart" className="relative p-2 text-deep-plum hover:bg-lavender-bg/50 rounded-full transition-colors" aria-label="Cart">
              <span className="material-symbols-outlined !text-[24px]" data-icon="shopping_cart">
                shopping_cart
              </span>
              {liveCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-deep-plum text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {liveCount}
                </span>
              )}
            </Link>
            <div className="h-10 w-10 rounded-full bg-lavender-bg overflow-hidden border border-outline-variant/30 ml-2 cursor-pointer hover:ring-2 ring-deep-plum/20 transition-all">
              <img alt="Customer profile" className="w-full h-full object-cover" src={profileSrc} />
            </div>
          </div>
        </div>
      </div>
      <nav className="bg-white border-b border-outline-variant/20 sticky top-20 md:top-24 z-40 overflow-x-auto no-scrollbar">
        <div className="max-w-[1440px] mx-auto flex items-center justify-center px-margin-mobile md:px-margin-desktop py-4 whitespace-nowrap gap-12">
          {navItems.map((item) => (
            <Link
              key={item.label}
              className={`font-label-bold text-label-bold pb-1 border-b-[3px] border-transparent hover:text-deep-plum transition-colors ${item.isActive
                  ? "nav-item-active"
                  : "text-on-surface-variant"
                }`}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
