"use client";

/**
 * Install prompt — shown only when the PWA is NOT already installed.
 *
 * Shows on every platform (iOS / Android / desktop), not only when the
 * browser fires `beforeinstallprompt` (that event never fires on iOS, and
 * fails on plain HTTP LAN IPs used with Docker phone testing).
 *
 * - Secure context + Chromium: one-tap Install via deferred prompt
 * - Otherwise: clear manual “Add to Home Screen / Install” steps
 */

import { useCallback, useEffect, useState } from "react";
import {
  checkInstalledRelatedApps,
  getInstallPlatform,
  isPwaInstalled,
  isPwaRuntimeEnabled,
  isRunningAsInstalledPwa,
  isSecurePwaContext,
  markInstallDismissed,
  markPwaInstalled,
  wasInstallDismissedRecently,
  type InstallPlatform,
} from "@/lib/pwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function instructionCopy(
  platform: InstallPlatform,
  canNativeInstall: boolean,
  secure: boolean
): { title: string; body: string } {
  if (canNativeInstall) {
    return {
      title: "Install Cake Break",
      body: "Add this app to your home screen or desktop for faster access. You won’t see this again after installing.",
    };
  }

  if (platform === "ios") {
    return {
      title: "Install Cake Break",
      body: "Tap Share, then “Add to Home Screen”. Open it from your home screen next time for the app experience.",
    };
  }

  if (platform === "android") {
    if (!secure) {
      return {
        title: "Add Cake Break to home screen",
        body: "In Chrome: tap ⋮ (menu) → “Add to Home screen” or “Install app”. Full one-tap install needs HTTPS (production).",
      };
    }
    return {
      title: "Install Cake Break",
      body: "In Chrome: tap ⋮ (menu) → “Install app” or “Add to Home screen”.",
    };
  }

  if (platform === "desktop") {
    if (!secure) {
      return {
        title: "Install Cake Break",
        body: "Use Chrome/Edge address-bar install icon when available. Full PWA install needs HTTPS (or localhost).",
      };
    }
    return {
      title: "Install Cake Break",
      body: "Look for the install icon in the address bar, or open the browser menu → “Install Cake Break”.",
    };
  }

  return {
    title: "Install Cake Break",
    body: "Use your browser menu to “Add to Home screen” or “Install app”.",
  };
}

export default function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [platform, setPlatform] = useState<InstallPlatform>("unknown");
  const [secure, setSecure] = useState(true);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  const hideForeverAsInstalled = useCallback(() => {
    markPwaInstalled();
    setVisible(false);
    setDeferred(null);
  }, []);

  const hideForNow = useCallback(() => {
    markInstallDismissed();
    setVisible(false);
    setDeferred(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPwaRuntimeEnabled()) return;

    // Already in the installed app shell → mark + never show.
    if (isRunningAsInstalledPwa()) {
      markPwaInstalled();
      return;
    }
    if (isPwaInstalled()) return;
    if (wasInstallDismissedRecently()) return;

    setPlatform(getInstallPlatform());
    setSecure(isSecurePwaContext());

    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let mediaQuery: MediaQueryList | null = null;

    const onDisplayModeChange = () => {
      if (isRunningAsInstalledPwa()) hideForeverAsInstalled();
    };

    mediaQuery = window.matchMedia("(display-mode: standalone)");
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onDisplayModeChange);
    } else {
      mediaQuery.addListener(onDisplayModeChange);
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      if (cancelled || isPwaInstalled()) return;
      setDeferred(e as BeforeInstallPromptEvent);
      // Show immediately when the browser is ready to install.
      setVisible(true);
    };

    const onInstalled = () => {
      hideForeverAsInstalled();
    };

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);

    void (async () => {
      const related = await checkInstalledRelatedApps();
      if (cancelled) return;
      if (related === true) hideForeverAsInstalled();
    })();

    // Always surface a banner if still not installed — do not wait forever
    // for beforeinstallprompt (never fires on iOS / often missing on HTTP).
    showTimer = setTimeout(() => {
      if (cancelled) return;
      if (isPwaInstalled() || wasInstallDismissedRecently()) return;
      setVisible(true);
    }, 2500);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      if (showTimer) clearTimeout(showTimer);
      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === "function") {
          mediaQuery.removeEventListener("change", onDisplayModeChange);
        } else {
          mediaQuery.removeListener(onDisplayModeChange);
        }
      }
    };
  }, [hideForeverAsInstalled]);

  const install = useCallback(async () => {
    if (!deferred || isPwaInstalled()) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        hideForeverAsInstalled();
      } else {
        hideForNow();
      }
    } catch {
      hideForNow();
    } finally {
      setDeferred(null);
      setInstalling(false);
    }
  }, [deferred, hideForeverAsInstalled, hideForNow]);

  if (!visible || isPwaInstalled()) return null;

  const canNativeInstall = Boolean(deferred);
  const copy = instructionCopy(platform, canNativeInstall, secure);

  return (
    <div
      role="dialog"
      aria-label="Install Cake Break app"
      aria-live="polite"
      className="fixed bottom-0 inset-x-0 z-[80] p-4 sm:p-6 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-lg rounded-2xl border border-outline-variant/40 bg-white shadow-[0_-8px_40px_rgba(74,21,75,0.18)] p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 rounded-xl shrink-0 shadow-sm"
          />
          <div className="space-y-1 min-w-0 flex-1">
            <p className="font-label-bold text-sm text-deep-plum uppercase tracking-wider">
              {copy.title}
            </p>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {copy.body}
            </p>
            {platform === "ios" && (
              <p className="text-xs text-on-surface-variant/90 pt-1">
                Safari →{" "}
                <span className="font-semibold text-deep-plum">Share</span>{" "}
                <span
                  className="material-symbols-outlined !text-[14px] align-text-bottom text-deep-plum"
                  aria-hidden
                >
                  ios_share
                </span>{" "}
                →{" "}
                <span className="font-semibold text-deep-plum">
                  Add to Home Screen
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={hideForNow}
            className="shrink-0 rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container-low transition-colors"
            aria-label="Dismiss install prompt"
          >
            <span className="material-symbols-outlined !text-[20px]">close</span>
          </button>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={hideForNow}
            className="rounded-full border border-outline-variant/60 px-5 py-2.5 text-xs font-label-bold uppercase tracking-widest text-deep-plum hover:border-vibrant-magenta hover:text-vibrant-magenta transition-colors"
          >
            Not now
          </button>
          {canNativeInstall ? (
            <button
              type="button"
              onClick={install}
              disabled={installing}
              className="rounded-full bg-deep-plum px-5 py-2.5 text-xs font-label-bold uppercase tracking-widest text-white hover:bg-vibrant-magenta transition-colors disabled:opacity-60"
            >
              {installing ? "Installing…" : "Install"}
            </button>
          ) : (
            <button
              type="button"
              onClick={hideForNow}
              className="rounded-full bg-deep-plum px-5 py-2.5 text-xs font-label-bold uppercase tracking-widest text-white hover:bg-vibrant-magenta transition-colors"
            >
              {platform === "ios" ? "Got it" : "OK"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
