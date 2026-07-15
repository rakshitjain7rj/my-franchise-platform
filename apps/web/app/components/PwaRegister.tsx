"use client";

/**
 * Registers the Cake Break service worker after hydration.
 * Production / Docker only. Requires a secure context (HTTPS or localhost).
 */

import { useEffect } from "react";
import {
  isPwaRuntimeEnabled,
  isRunningAsInstalledPwa,
  isSecurePwaContext,
  markPwaInstalled,
} from "@/lib/pwa";

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!isPwaRuntimeEnabled()) return;

    if (isRunningAsInstalledPwa()) {
      markPwaInstalled();
    }

    // SW registration is rejected on http://LAN_IP — fail quietly.
    if (!isSecurePwaContext()) {
      if (process.env.NODE_ENV !== "production") {
        console.info(
          "[PWA] Skipping service worker: page is not a secure context (use HTTPS or localhost)."
        );
      }
      return;
    }

    let cancelled = false;
    let removeFocus: (() => void) | undefined;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        if (cancelled) return;

        const onFocus = () => {
          registration.update().catch(() => {});
        };
        window.addEventListener("focus", onFocus);
        removeFocus = () => window.removeEventListener("focus", onFocus);

        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              installing.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      } catch (err) {
        console.warn("[PWA] Service worker registration failed:", err);
      }
    };

    const idle =
      "requestIdleCallback" in window
        ? (cb: () => void) =>
            (
              window as Window & {
                requestIdleCallback: (
                  fn: () => void,
                  opts?: { timeout: number }
                ) => number;
              }
            ).requestIdleCallback(cb, { timeout: 3000 })
        : (cb: () => void) => window.setTimeout(cb, 1200);

    const idleId = idle(() => {
      void register();
    });

    return () => {
      cancelled = true;
      removeFocus?.();
      if ("cancelIdleCallback" in window && typeof idleId === "number") {
        (
          window as Window & { cancelIdleCallback: (id: number) => void }
        ).cancelIdleCallback(idleId);
      } else {
        clearTimeout(idleId as number);
      }
    };
  }, []);

  return null;
}
