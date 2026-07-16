/**
 * Store-selection cookie helpers.
 *
 * `selected_store_location_id` / `selected_store_name` must survive until the
 * shopper explicitly picks another bakery (or clears site data). We use a 6-month
 * max-age to remain compliant with UK/GDPR rules.
 */

export const STORE_ID_COOKIE = "selected_store_location_id";
export const STORE_NAME_COOKIE = "selected_store_name";
export const FRANCHISE_COOKIE = "franchise_id";

/** ~6 months in seconds — compliant with UK/GDPR rules. */
export const STORE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;


/**
 * Write a browser cookie that does not expire with the session.
 * Client-side only (`document.cookie`).
 */
export function setPersistentCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${STORE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

/**
 * Options for Next.js `response.cookies.set` / `cookies().set`.
 */
export function persistentCookieOptions(): {
  path: string;
  sameSite: "lax";
  httpOnly: false;
  maxAge: number;
} {
  return {
    path: "/",
    sameSite: "lax",
    httpOnly: false, // readable by client-side JS (Header, map picker)
    maxAge: STORE_COOKIE_MAX_AGE_SECONDS,
  };
}
