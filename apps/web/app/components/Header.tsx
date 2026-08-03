"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ShoppingCart,
  User,
  Cake,
  MapPin,
  LogOut,
  Settings,
  ChevronDown,
  Menu,
  X,
  Heart,
  Package,
} from "lucide-react";
import StoreSelectionBanner from "@/components/store-selection-banner";
import { getCurrentCustomer, logoutCustomer } from "@/lib/auth/auth-actions";
import { useCart } from "@/lib/cart/cart-context";
import { useSelectedStore } from "@/lib/store-selection";
import { setWishlistCustomerId } from "@/lib/wishlist";
import MegaMenu from "./MegaMenu";
import HeaderSearch from "./HeaderSearch";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { totalItems, clearCart } = useCart();
  const { storeName: selectedStoreName } = useSelectedStore();

  const [customer, setCustomer] = useState<{ first_name?: string | null; email: string } | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [wishlistCount, setWishlistCount] = useState(0);

  useEffect(() => {
    const updateWishlistCount = () => {
      if (typeof window !== "undefined") {
        try {
          // Derive the same per-user key that wishlist.ts uses.
          const customerId = localStorage.getItem("cake_customer_id");
          const key = customerId ? `cake_wishlist_${customerId}` : "cake_wishlist_guest";
          const stored = localStorage.getItem(key);
          const list = stored ? JSON.parse(stored) : [];
          setWishlistCount(list.length);
        } catch (e) {
          console.error("Error reading wishlist count:", e);
        }
      }
    };

    updateWishlistCount();
    window.addEventListener("wishlist-updated", updateWishlistCount);
    return () => window.removeEventListener("wishlist-updated", updateWishlistCount);
  }, []);


  // Resolve the logged-in customer whenever the route changes (e.g. after
  // login → home) and whenever auth code dispatches `auth-changed`.
  // Previously this only ran once on mount, so a soft navigation after sign-in
  // could leave the header stuck on "Sign In" even with a valid session cookie.
  useEffect(() => {
    let cancelled = false;

    const fetchCustomer = async () => {
      try {
        const profile = await getCurrentCustomer();
        if (!cancelled) {
          setCustomer(profile);
          // Sync the customer ID so wishlist.ts uses the right per-user key.
          setWishlistCustomerId(profile?.id ?? null);
          // Re-count wishlist for the newly resolved user.
          window.dispatchEvent(new Event("wishlist-updated"));
        }
      } catch (err) {
        console.error("[Header] Failed to resolve customer session:", err);
        if (!cancelled) {
          setCustomer(null);
          setWishlistCustomerId(null);
          window.dispatchEvent(new Event("wishlist-updated"));
        }
      }
    };

    fetchCustomer();

    const onAuthChanged = () => {
      fetchCustomer();
    };
    window.addEventListener("auth-changed", onAuthChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("auth-changed", onAuthChanged);
    };
  }, [pathname]);

  // Handle scroll detection for sticky glassmorphic effects
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = async () => {
    await logoutCustomer();
    // Drop the session's cart so the next visitor (or another account) on
    // this browser never inherits the previous customer's items.
    clearCart();
    setCustomer(null);
    // Clear the stored customer ID so the wishlist resets to the guest slot.
    setWishlistCustomerId(null);
    setIsMobileMenuOpen(false);
    // Notify any other mounts (or a soft-nav destination) that the session ended.
    window.dispatchEvent(new Event("auth-changed"));
    router.refresh();
  };

  // "Cakes" is rendered via MegaMenu (flyout) — not listed here.
  const navLinks = [
    { label: "Home", href: "/" },
    { label: "About Us", href: "/about" },
    { label: "Apply Franchise", href: "/franchise" },
    { label: "Contact Us", href: "/contact" },
  ];

  // Account destinations only exist for an authenticated customer session.
  // Guests must never see these — they have no profile, orders, or address book.
  // Shared by desktop dropdown + mobile drawer so both stay in lockstep.
  const accountNavItems = [
    {
      label: "My Account",
      href: "/account?tab=overview",
      icon: Settings,
    },
    {
      label: "My Profile",
      href: "/account?tab=profile",
      icon: User,
    },
    {
      label: "My Orders",
      href: "/account?tab=orders",
      icon: Package,
    },
    {
      label: `My Wishlist (${wishlistCount})`,
      href: "/wishlist",
      icon: Heart,
    },
    {
      label: "Address Book",
      href: "/account?tab=addresses",
      icon: MapPin,
    },
  ] as const;

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!customer) return "";
    if (customer.first_name) {
      return customer.first_name[0].toUpperCase();
    }
    return customer.email[0].toUpperCase();
  };

  // Catalogue has its own search field — hide the global header search there
  // (desktop bar + mobile drawer) so the UI is not duplicated.
  const isCakeCatalogue =
    pathname === "/cake-catalogue" || pathname.startsWith("/cake-catalogue/");

  return (
    <>
      <StoreSelectionBanner />
      <header
        className={`sticky top-0 z-50 w-full transition-all duration-300 ease-in-out border-b ${
          isScrolled
            ? "bg-white/85 backdrop-blur-md border-purple-100/60 shadow-[0_8px_30px_rgba(74,21,75,0.03)] py-3"
            : "bg-white border-purple-50 py-4 md:py-5"
        }`}
      >
        <div className="container mx-auto flex items-center justify-between px-5">
          {/* Logo Section */}
          <Link href="/" className="flex items-center gap-2 md:gap-2.5 group select-none">
            <div className="relative bg-gradient-to-tr from-purple-100 to-pink-50 p-2 rounded-xl text-purple-700 group-hover:scale-105 group-hover:rotate-6 transition-all duration-300 shadow-sm border border-purple-200/20">
              <Cake className="h-5 w-5 md:h-6 md:w-6 text-purple-700" />
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
              </span>
            </div>
            <h1 className="text-lg md:text-2xl lg:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-purple-900 via-purple-700 to-pink-600 bg-clip-text text-transparent group-hover:opacity-90 transition-opacity">
              Cake Break
            </h1>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-5 lg:gap-8">
            <Link
              href="/"
              className={`relative text-sm font-semibold tracking-wide py-1.5 transition-all duration-300 group ${
                pathname === "/"
                  ? "text-purple-950 font-bold"
                  : "text-gray-600 hover:text-purple-700"
              }`}
            >
              Home
              <span
                className={`absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-purple-600 to-pink-500 rounded-full transition-transform duration-300 origin-center ${
                  pathname === "/" ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                }`}
              />
            </Link>
            <MegaMenu />
            {navLinks
              .filter((l) => l.href !== "/")
              .map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`relative text-sm font-semibold tracking-wide py-1.5 transition-all duration-300 group ${
                      isActive
                        ? "text-purple-950 font-bold"
                        : "text-gray-600 hover:text-purple-700"
                    }`}
                  >
                    {link.label}
                    <span
                      className={`absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-purple-600 to-pink-500 rounded-full transition-transform duration-300 origin-center ${
                        isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                      }`}
                    />
                  </Link>
                );
              })}
          </nav>

          {/* Right Section */}
          <div className="flex items-center gap-2 md:gap-4 lg:gap-5">
            {/* Search → cake catalogue (hidden on catalogue; page has its own field) */}
            {!isCakeCatalogue && (
              <div className="hidden sm:block">
                <HeaderSearch />
              </div>
            )}

            {/* Store Locator / Map Routing - Desktop only */}
            <Link
              href="/map-routing"
              className={`hidden sm:flex items-center gap-1.5 font-semibold text-xs md:text-sm py-2 px-3.5 rounded-full transition-all duration-300 border ${
                selectedStoreName
                  ? "bg-green-50/50 border-green-200/70 hover:border-green-300 text-green-800 hover:bg-green-50"
                  : "bg-purple-50/50 border-purple-100 hover:border-purple-300 text-purple-700 hover:bg-purple-50 animate-pulse hover:animate-none"
              }`}
              title={
                totalItems > 0 && selectedStoreName
                  ? `Order bakery: ${selectedStoreName} (empty cart to change)`
                  : selectedStoreName
                    ? `Selected Store: ${selectedStoreName}`
                    : "Find a Bakery"
              }
            >
              {selectedStoreName ? (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              ) : (
                <MapPin className="h-3.5 w-3.5 shrink-0 text-purple-500" />
              )}
              <span className="max-w-[80px] md:max-w-[140px] truncate">
                {selectedStoreName || "Select Store"}
              </span>
            </Link>

            {/* Public wishlist — guests and signed-in customers share /wishlist */}
            <Link
              href="/wishlist"
              className="relative p-2.5 text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded-full transition-all duration-300"
              aria-label="Wishlist"
            >
              <Heart className="h-5.5 w-5.5 md:h-6 md:w-6" />
              {wishlistCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-[10px] font-bold h-5 min-w-[20px] px-1.5 rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-all duration-300 animate-in zoom-in-50">
                  {wishlistCount}
                </span>
              )}
            </Link>

            {/* Cart */}
            <Link
              href="/cart"
              className="relative p-2.5 text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded-full transition-all duration-300"
              aria-label="Cart"
            >
              <ShoppingCart className="h-5.5 w-5.5 md:h-6 md:w-6" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-[10px] font-bold h-5 min-w-[20px] px-1.5 rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-all duration-300 animate-in zoom-in-50">
                  {totalItems}
                </span>
              )}
            </Link>

            {/* Authenticated account menu, or Sign In for guests — desktop only */}
            <div className="relative hidden sm:block group">
              {customer ? (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 p-1 rounded-full hover:bg-purple-50 transition-all duration-300 outline-none focus:outline-none"
                    aria-label="User Account"
                    aria-haspopup="menu"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 text-white flex items-center justify-center font-bold text-sm shadow-sm hover:ring-2 hover:ring-purple-300/40 transition-all duration-300">
                      {getUserInitials()}
                    </div>
                    <span className="hidden md:inline-flex items-center gap-0.5 text-xs font-semibold text-purple-900 pr-1">
                      Hi, {customer.first_name || "Guest"}
                      <ChevronDown className="h-3.5 w-3.5 text-purple-500/70" />
                    </span>
                  </button>

                  <div className="absolute right-0 top-full pt-1.5 w-64 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-200 ease-out">
                    <div className="bg-white/95 backdrop-blur-md border border-purple-100 rounded-2xl shadow-[0_10px_40px_rgba(74,21,75,0.08)] py-2">
                      <div className="px-4 py-3 border-b border-purple-50 bg-gradient-to-r from-purple-50/30 to-pink-50/10">
                        <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Logged in as</p>
                        <p className="text-sm font-bold text-purple-950 truncate mt-0.5">
                          {customer.first_name ? `${customer.first_name}` : customer.email}
                        </p>
                        <p className="text-xs text-purple-500 truncate">{customer.email}</p>
                      </div>

                      <div className="p-1 flex flex-col gap-0.5">
                        <Link
                          href="/checkout-page"
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-purple-800 hover:bg-purple-50 hover:text-purple-950 rounded-lg transition-colors font-medium"
                        >
                          <ShoppingCart className="h-4 w-4 text-purple-500" />
                          Checkout
                        </Link>

                        {accountNavItems.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-purple-800 hover:bg-purple-50 hover:text-purple-950 rounded-lg transition-colors font-medium"
                            >
                              <Icon className="h-4 w-4 text-purple-500" />
                              {item.label}
                            </Link>
                          );
                        })}

                        <div className="my-1 border-t border-purple-50" />

                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left font-medium"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Guests: auth CTA only — no account destinations. */}
                  <Link
                    href="/login"
                    className="flex items-center gap-1.5 py-1.5 px-4 rounded-full border border-purple-100 hover:border-purple-200 text-purple-700 bg-purple-50/20 hover:bg-purple-50 font-semibold text-sm transition-all duration-300 shadow-sm outline-none focus:outline-none"
                    aria-label="Sign In"
                  >
                    <User className="h-4 w-4 text-purple-600" />
                    <span>Sign In</span>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`md:hidden relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-all duration-300 ${
                isMobileMenuOpen
                  ? "bg-purple-100 border-purple-200 text-purple-900 shadow-inner"
                  : "bg-white border-purple-100/80 text-purple-800 hover:bg-purple-50 hover:border-purple-200 shadow-sm"
              }`}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav-drawer"
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" strokeWidth={2.25} />
              ) : (
                <Menu className="h-5 w-5" strokeWidth={2.25} />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div
            id="mobile-nav-drawer"
            className="md:hidden absolute top-full left-0 w-full z-40 max-h-[min(85vh,720px)] overflow-y-auto overscroll-contain animate-in slide-in-from-top-2 fade-in duration-300"
          >
            <div className="mx-3 mb-3 mt-1 rounded-2xl border border-purple-100/80 bg-white/98 backdrop-blur-xl shadow-[0_20px_50px_rgba(74,21,75,0.12)]">
              <div className="flex flex-col gap-1 p-3 sm:p-4">
                {/* Mobile search → catalogue (hidden on catalogue; page has its own field) */}
                {!isCakeCatalogue && (
                  <div className="pb-3 mb-1 border-b border-purple-50">
                    <HeaderSearch
                      className="w-full"
                      onNavigate={() => setIsMobileMenuOpen(false)}
                    />
                  </div>
                )}

                {/* Mobile User Profile Section */}
                <div className="pb-3 mb-1 border-b border-purple-50">
                  {customer ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 text-white flex items-center justify-center font-bold text-base shadow-sm ring-2 ring-purple-100">
                          {getUserInitials()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-purple-950 truncate">
                            Hi, {customer.first_name || "Guest"}
                          </p>
                          <p className="text-xs text-purple-500 truncate">
                            {customer.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Link
                          href="/account"
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="p-2.5 text-purple-600 hover:bg-purple-50 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Account Settings"
                          aria-label="Account settings"
                        >
                          <Settings className="h-5 w-5" />
                        </Link>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Sign Out"
                          aria-label="Sign out"
                        >
                          <LogOut className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Link
                      href="/login"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-purple-100 hover:border-purple-200 text-purple-700 bg-gradient-to-r from-purple-50/80 to-pink-50/40 font-bold text-sm transition-all shadow-sm"
                    >
                      <User className="h-4 w-4" />
                      <span>Sign In to Your Account</span>
                    </Link>
                  )}
                </div>

                {/* Mobile account links — only when a real session exists */}
                {customer && (
                  <div className="flex flex-col gap-0.5 pb-3 mb-1 border-b border-purple-50">
                    {accountNavItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="flex items-center gap-2.5 py-2.5 px-3 text-sm text-purple-800 hover:bg-purple-50 active:bg-purple-100 rounded-xl transition-colors font-medium min-h-[44px]"
                        >
                          <Icon className="h-4 w-4 text-purple-500 shrink-0" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* Mobile Store Locator
                    Important: the live-store ping must use `relative` on the
                    outer span. Without it, the absolute `h-full w-full` ping
                    positions against the drawer and covers the whole menu,
                    so taps on Cakes (and every other item) hit this link → /map-routing. */}
                <div className="pb-2 mb-1 border-b border-purple-50">
                  <Link
                    href="/map-routing"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`relative w-full flex items-center justify-between gap-3 py-3 px-3.5 rounded-xl transition-all duration-300 border min-h-[48px] ${
                      selectedStoreName
                        ? "bg-green-50/60 border-green-200/60 text-green-900"
                        : "bg-purple-50/60 border-purple-100 text-purple-800"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          selectedStoreName
                            ? "bg-green-100 text-green-700"
                            : "bg-purple-100 text-purple-600"
                        }`}
                      >
                        <MapPin className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-semibold truncate">
                        {selectedStoreName
                          ? selectedStoreName
                          : "Select nearest bakery"}
                      </span>
                    </div>
                    {selectedStoreName ? (
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-purple-500 shrink-0">
                        Find &rarr;
                      </span>
                    )}
                  </Link>
                </div>

                {/* Mobile Nav Links */}
                <nav className="flex flex-col gap-0.5 pt-1" aria-label="Mobile">
                  <Link
                    href="/"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center justify-between py-3 px-3.5 rounded-xl text-sm font-semibold transition-all duration-200 min-h-[48px] ${
                      pathname === "/"
                        ? "bg-purple-50 text-purple-950"
                        : "text-gray-700 hover:bg-purple-50/50 hover:text-purple-900 active:bg-purple-50"
                    }`}
                  >
                    <span>Home</span>
                    {pathname === "/" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    )}
                  </Link>

                  <MegaMenu
                    mobile
                    onNavigate={() => setIsMobileMenuOpen(false)}
                  />

                  {navLinks
                    .filter((l) => l.href !== "/")
                    .map((link) => {
                      const isActive = pathname === link.href;
                      return (
                        <Link
                          key={link.label}
                          href={link.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center justify-between py-3 px-3.5 rounded-xl text-sm font-semibold transition-all duration-200 min-h-[48px] ${
                            isActive
                              ? "bg-purple-50 text-purple-950"
                              : "text-gray-700 hover:bg-purple-50/50 hover:text-purple-900 active:bg-purple-50"
                          }`}
                        >
                          <span>{link.label}</span>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                          )}
                        </Link>
                      );
                    })}
                </nav>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}