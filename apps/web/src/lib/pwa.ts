/**
 * Shared PWA helpers for production / Docker storefront.
 * Browser APIs are only used on the client.
 */

export const PWA_INSTALLED_KEY = "cake_pwa_installed";
export const PWA_DISMISS_KEY = "cake_pwa_install_dismissed";

/** Soft-hide duration after "Not now" (ms). */
export const PWA_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export type InstallPlatform = "ios" | "android" | "desktop" | "unknown";

/**
 * True in production builds (Docker runner sets NODE_ENV=production).
 * Override for local testing: NEXT_PUBLIC_ENABLE_PWA_DEV=true
 */
export function isPwaRuntimeEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const force = process.env.NEXT_PUBLIC_ENABLE_PWA_DEV;
  return force === "true" || force === "1";
}

/** HTTPS or localhost — required for service workers + native install. */
export function isSecurePwaContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext === true;
}

/**
 * True when running as an installed PWA (home screen / standalone window).
 * Does NOT treat a localStorage flag alone as "installed" for display-mode
 * purposes — use wasMarkedInstalled() for that.
 */
export function isRunningAsInstalledPwa(): boolean {
  if (typeof window === "undefined") return false;

  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  if (window.matchMedia("(display-mode: window-controls-overlay)").matches) {
    return true;
  }

  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;

  if (document.referrer.startsWith("android-app://")) return true;

  return false;
}

export function wasMarkedInstalled(): boolean {
  try {
    return localStorage.getItem(PWA_INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Combined: already installed → never show install UI. */
export function isPwaInstalled(): boolean {
  if (isRunningAsInstalledPwa()) return true;
  return wasMarkedInstalled();
}

export function markPwaInstalled(): void {
  try {
    localStorage.setItem(PWA_INSTALLED_KEY, "1");
    localStorage.removeItem(PWA_DISMISS_KEY);
  } catch {
    // private mode
  }
}

export function wasInstallDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(PWA_DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < PWA_DISMISS_MS;
  } catch {
    return false;
  }
}

export function markInstallDismissed(): void {
  try {
    localStorage.setItem(PWA_DISMISS_KEY, String(Date.now()));
  } catch {
    // private mode
  }
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function getInstallPlatform(): InstallPlatform {
  if (isIosDevice()) return "ios";
  if (isAndroidDevice()) return "android";
  if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
    return "desktop";
  }
  return "unknown";
}

export async function checkInstalledRelatedApps(): Promise<boolean | null> {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<
      Array<{ id?: string; platform?: string; url?: string }>
    >;
  };
  if (typeof nav.getInstalledRelatedApps !== "function") return null;
  try {
    const apps = await nav.getInstalledRelatedApps();
    return Array.isArray(apps) && apps.length > 0;
  } catch {
    return null;
  }
}
