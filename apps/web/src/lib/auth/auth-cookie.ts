/**
 * src/lib/auth/auth-cookie.ts
 *
 * Single source of truth for the customer session cookie (`medusa_auth_token`).
 *
 * Why this exists
 * ---------------
 * Medusa customer auth is JWT-based. The storefront persists the JWT in an
 * httpOnly cookie and injects it as `Authorization: Bearer …` via
 * `getMedusaHeaders()` on every server-side Store API call.
 *
 * Cookie `Secure` must match how the site is actually served — not merely
 * whether `NODE_ENV === "production"`. A production Next.js build served over
 * plain HTTP (Docker / LAN demos) must set `Secure=false`, otherwise browsers
 * silently drop the Set-Cookie and the user appears logged out after a
 * successful sign-in. The backend already uses the same `COOKIE_SECURE=false`
 * contract for Medusa admin session cookies (see medusa-config.ts).
 *
 * Deploy matrix
 * -------------
 * | Environment              | COOKIE_SECURE | Result              |
 * |--------------------------|---------------|---------------------|
 * | Docker / local HTTP      | false         | Secure off          |
 * | Real HTTPS production    | unset / true  | Secure on (default) |
 * | next dev (NODE_ENV=dev)  | unset         | Secure off          |
 */

export const AUTH_COOKIE_NAME = "medusa_auth_token" as const;

/** 7-day sliding session window (seconds). */
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * Whether the auth cookie should carry the `Secure` flag.
 *
 * Explicit `COOKIE_SECURE` always wins so Docker/HTTP stacks and TLS production
 * can share the same production image without cookie breakage.
 */
export function isAuthCookieSecure(): boolean {
  const explicit = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (explicit === "false" || explicit === "0") return false;
  if (explicit === "true" || explicit === "1") return true;
  // Default: only mark Secure when the process is a production build.
  // Local `next dev` keeps Secure off so http://localhost works.
  return process.env.NODE_ENV === "production";
}

export type AuthCookieWriteOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

/**
 * Options for writing the session cookie (`cookies().set` / response.cookies).
 * Always use these — never inline a partial option bag that can drift from
 * logout / middleware expectations (especially `path` + `secure`).
 */
export function getAuthCookieOptions(
  maxAge: number = AUTH_COOKIE_MAX_AGE_SECONDS
): AuthCookieWriteOptions {
  return {
    httpOnly: true,
    secure: isAuthCookieSecure(),
    // Lax: sent on top-level navigations after login, blocks cross-site POSTs.
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

/**
 * Options that clear the session cookie. Must match path/secure/sameSite of the
 * write options so browsers actually remove the stored cookie.
 */
export function getAuthCookieClearOptions(): AuthCookieWriteOptions {
  return getAuthCookieOptions(0);
}
