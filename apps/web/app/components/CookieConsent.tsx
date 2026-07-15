"use client";

/**
 * GDPR-style cookie consent banner.
 * Preference stored in localStorage under cake_cookie_consent.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "cake_cookie_consent";

type ConsentValue = "accepted" | "essential";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const save = (value: ConsentValue) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
      // Lightweight cookie for server-side awareness if needed later
      document.cookie = `cake_cookie_consent=${value};path=/;max-age=${
        60 * 60 * 24 * 365
      };samesite=lax`;
    } catch {
      // private mode — still hide the banner for this session
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 z-[70] p-4 sm:p-6 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-outline-variant/40 bg-white/95 backdrop-blur-md shadow-[0_-8px_40px_rgba(74,21,75,0.12)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 space-y-1.5 min-w-0">
          <p className="font-label-bold text-sm text-deep-plum uppercase tracking-wider">
            We use cookies
          </p>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Cake Break uses essential cookies to keep your store selection and
            cart working, and optional analytics cookies to improve the
            experience. See our{" "}
            <Link
              href="/privacy"
              className="text-deep-plum font-semibold underline underline-offset-2 hover:text-vibrant-magenta"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            type="button"
            onClick={() => save("essential")}
            className="h-11 px-5 rounded-full border border-outline-variant/50 text-xs font-label-bold uppercase tracking-widest text-deep-plum hover:bg-lavender-bg transition-colors"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => save("accepted")}
            className="h-11 px-5 rounded-full bg-deep-plum text-white text-xs font-label-bold uppercase tracking-widest hover:bg-vibrant-magenta transition-colors"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
