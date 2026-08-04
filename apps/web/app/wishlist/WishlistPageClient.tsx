"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Trash2, Check } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { getCurrentCustomer } from "@/lib/auth/auth-actions";
import {
  getWishlist,
  removeFromWishlist,
  WISHLIST_TRANSFER_TOAST_KEY,
  type WishlistItem,
} from "@/lib/wishlist";

export default function WishlistPageClient() {
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    setWishlist(getWishlist());
    const handleUpdate = () => setWishlist(getWishlist());
    window.addEventListener("wishlist-updated", handleUpdate);
    window.addEventListener("auth-changed", handleUpdate);
    return () => {
      window.removeEventListener("wishlist-updated", handleUpdate);
      window.removeEventListener("auth-changed", handleUpdate);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await getCurrentCustomer();
        if (!cancelled) {
          setIsSignedIn(!!profile);
          setAuthResolved(true);
        }
      } catch {
        if (!cancelled) {
          setIsSignedIn(false);
          setAuthResolved(true);
        }
      }
    })();

    const onAuthChanged = async () => {
      try {
        const profile = await getCurrentCustomer();
        if (!cancelled) setIsSignedIn(!!profile);
      } catch {
        if (!cancelled) setIsSignedIn(false);
      }
      setWishlist(getWishlist());
    };
    window.addEventListener("auth-changed", onAuthChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("auth-changed", onAuthChanged);
    };
  }, []);

  // Post-signup transfer toast handoff from sessionStorage.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(WISHLIST_TRANSFER_TOAST_KEY);
      if (!raw) return;
      sessionStorage.removeItem(WISHLIST_TRANSFER_TOAST_KEY);
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1) return;
      setToastMessage(
        `Saved ${n} item${n === 1 ? "" : "s"} to your wishlist.`
      );
      const t = window.setTimeout(() => setToastMessage(null), 4500);
      return () => window.clearTimeout(t);
    } catch {
      // ignore
    }
  }, []);

  const handleRemove = (id: string) => {
    removeFromWishlist(id);
  };

  const showGuestCtas = authResolved && !isSignedIn;

  return (
    <div className="flex flex-col min-h-screen bg-page-bg">
      <Header />

      <main className="flex-grow pt-20 sm:pt-28 pb-20 md:pb-16 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-extrabold font-heading text-deep-plum">
              My Wishlist
            </h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Your favorite cakes saved for later.
            </p>
          </div>

          {showGuestCtas && (
            <div className="mb-6 rounded-2xl border border-purple-100 bg-white p-4 sm:p-5 shadow-sm">
              <p className="text-sm text-deep-plum font-medium">
                {wishlist.length > 0
                  ? "Create an account to keep these items on this device after you sign up."
                  : "Sign up to save favorites to your account when you create one."}
              </p>
              <p className="text-xs text-on-surface-variant mt-1">
                Signing in to an existing account loads that account&apos;s wishlist
                (guest items are not merged).
              </p>
              <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Link
                  href={`/signup?redirect=${encodeURIComponent("/wishlist")}`}
                  className="inline-flex items-center justify-center h-10 px-5 rounded-xl bg-deep-plum text-white text-xs font-semibold hover:bg-deep-plum/90 transition-all"
                >
                  Sign up to save your wishlist
                </Link>
                <Link
                  href={`/login?redirect=${encodeURIComponent("/wishlist")}`}
                  className="inline-flex items-center justify-center h-10 px-5 rounded-xl border border-purple-200 bg-white text-deep-plum text-xs font-semibold hover:bg-lavender-bg transition-all"
                >
                  Sign in
                </Link>
              </div>
            </div>
          )}

          {wishlist.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-purple-100 text-on-surface-variant">
              <Heart className="h-12 w-12 mx-auto mb-4 text-outline-variant text-purple-200" />
              <p className="font-medium">Your wishlist is empty.</p>
              <p className="text-sm mt-1">
                Explore our cakes and save your favorites!
              </p>
              <Link
                href="/cake-catalogue"
                className="mt-4 inline-flex items-center justify-center h-10 px-5 rounded-xl bg-deep-plum text-white text-xs font-semibold hover:bg-deep-plum/90 transition-all"
              >
                Browse Cakes
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {wishlist.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-purple-100 rounded-2xl p-4 shadow-sm flex gap-4 items-center"
                >
                  {item.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="h-20 w-20 rounded-xl object-cover shrink-0 border border-purple-50"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-xl bg-lavender-bg shrink-0 flex items-center justify-center text-secondary text-2xl">
                      🎂
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-deep-plum truncate">
                      {item.title}
                    </h3>
                    <p className="text-sm font-bold text-secondary mt-1">
                      {item.price}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Link
                        href={`/products/${item.handle}`}
                        className="flex-1 flex items-center justify-center h-8 rounded-lg bg-deep-plum text-white text-xs font-semibold hover:bg-vibrant-magenta transition-all"
                      >
                        View Cake
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleRemove(item.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 border border-red-100 rounded-lg transition"
                        title="Remove from Wishlist"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {toastMessage && (
        <div
          className="fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2 max-w-sm w-[calc(100%-2rem)] rounded-2xl bg-[#4A154B] shadow-xl px-4 py-3 flex items-start gap-3"
          role="status"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF69B4]">
            <Check className="h-4 w-4 text-white" />
          </span>
          <div>
            <p className="text-xs font-semibold text-[#FF69B4]">Wishlist</p>
            <p className="text-sm font-semibold text-white mt-0.5">
              {toastMessage}
            </p>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
