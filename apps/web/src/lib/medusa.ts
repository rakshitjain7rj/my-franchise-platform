/**
 * medusa.ts — Centralised fetch wrapper for the Medusa Store API.
 *
 * All storefront data-fetching should go through `medusaFetch` so that:
 *  - The correct backend URL is used consistently.
 *  - The `x-franchise-id` header is injected automatically when a franchise
 *    cookie is present, enforcing catalog isolation for multi-tenancy.
 *  - Next.js caching / revalidation directives are applied uniformly.
 */

import {
  FRANCHISE_COOKIE,
  getBrowserCookie,
  STORE_ID_COOKIE,
} from "@/lib/store-cookies";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface MedusaFetchOptions<TBody = unknown> {
  /** Path relative to the Medusa Store API root, e.g. "/store/products" */
  path: string;

  /** HTTP method — defaults to "GET". */
  method?: HttpMethod;

  /** Request body. Will be JSON-serialised automatically. */
  body?: TBody;

  /** Additional request headers merged on top of defaults. */
  headers?: Record<string, string>;

  /**
   * Next.js fetch cache directive.
   * Pass `"no-store"` for dynamic, per-request data.
   * Pass `"force-cache"` (default) for static / pre-rendered data.
   * Mutually exclusive with `next`.
   */
  cache?: RequestCache;

  /**
   * Next.js revalidation / tagging options.
   * Example: `{ revalidate: 60 }` or `{ tags: ["products"] }`.
   * Mutually exclusive with `cache`.
   */
  next?: NextFetchRequestConfig;
}

export interface MedusaFetchResult<TData = unknown> {
  data: TData | null;
  error: string | null;
  status: number;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

const MEDUSA_BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "http://localhost:9000";

/**
 * Unified fetch utility for the Medusa Store API.
 *
 * @example — Client Component (cookie read automatically)
 * ```ts
 * const { data, error } = await medusaFetch<{ products: Product[] }>({
 *   path: "/store/products",
 *   next: { revalidate: 60, tags: ["products"] },
 * });
 * ```
 *
 * @example — Server Component (pass cookie value from next/headers)
 * ```ts
 * import { cookies } from "next/headers";
 *
 * const franchiseId = cookies().get("franchise_id")?.value;
 * const { data } = await medusaFetch<{ products: Product[] }>({
 *   path: "/store/products",
 *   headers: { "x-franchise-id": franchiseId ?? "" },
 *   next: { tags: ["products"] },
 * });
 * ```
 */
export async function medusaFetch<TData = unknown, TBody = unknown>(
  options: MedusaFetchOptions<TBody>
): Promise<MedusaFetchResult<TData>> {
  const {
    path,
    method = "GET",
    body,
    headers: extraHeaders = {},
    cache,
    next,
  } = options;

  // ── Build headers ──────────────────────────────────────────────────────────
  const publishableApiKey =
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_MEDUSA_API_KEY ??
    "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(publishableApiKey
      ? { "x-publishable-api-key": publishableApiKey }
      : {}),
    ...extraHeaders,
  };

  // Inject franchise header from cookie if present and not already overridden
  // by the caller (e.g. a Server Component that reads cookies() directly).
  if (!headers["x-franchise-id"]) {
    const franchiseId = getBrowserCookie(FRANCHISE_COOKIE);
    if (franchiseId) {
      headers["x-franchise-id"] = franchiseId;
    }
  }

  // Inject store-location header from cookie. When the user has picked a store
  // (cookie set by MapRoutingShell / BakerySidebar), this forwards it so the
  // backend applies per-store product availability filtering.
  if (!headers["x-store-location-id"]) {
    const storeLocationId = getBrowserCookie(STORE_ID_COOKIE);
    if (storeLocationId) {
      headers["x-store-location-id"] = storeLocationId;
    }
  }

  // Auth JWT is httpOnly (AUTH_COOKIE_NAME) and intentionally NOT readable
  // from document.cookie. Client-side medusaFetch never attaches Authorization;
  // authenticated calls must go through Server Actions / getMedusaHeaders().
  // Leaving this branch out prevents a false sense of "auth" from a missing cookie.

  // Remove the header entirely if the caller passed an empty string
  // (avoids sending `x-franchise-id: ""`  which could confuse the backend).
  if (headers["x-franchise-id"] === "") {
    delete headers["x-franchise-id"];
  }
  if (headers["x-store-location-id"] === "") {
    delete headers["x-store-location-id"];
  }
  if (headers["Authorization"] === "") {
    delete headers["Authorization"];
  }

  // ── Build fetch init ───────────────────────────────────────────────────────
  // `cache` and `next` are mutually exclusive in Next.js extended fetch.
  const fetchInit: RequestInit & { next?: NextFetchRequestConfig } = {
    method,
    headers,
  };

  if (body !== undefined) {
    fetchInit.body = JSON.stringify(body);
  }

  if (next !== undefined) {
    fetchInit.next = next;
  } else if (cache !== undefined) {
    fetchInit.cache = cache;
  } else {
    // Safe default: always revalidate on server render but cache in CDN.
    fetchInit.next = { revalidate: 0 };
  }

  // ── Execute fetch ──────────────────────────────────────────────────────────
  const url = `${MEDUSA_BACKEND_URL}${path}`;

  try {
    const response = await fetch(url, fetchInit);

    // Try to parse JSON regardless of status so we can surface Medusa errors.
    let data: TData | null = null;
    let error: string | null = null;

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const json = await response.json();

      if (!response.ok) {
        // Medusa error responses follow { type, message } or { error } shape.
        error =
          (json as { message?: string; error?: string }).message ??
          (json as { error?: string }).error ??
          `Request failed with status ${response.status}`;
      } else {
        data = json as TData;
      }
    } else if (!response.ok) {
      error = `Request failed with status ${response.status}`;
    }

    return { data, error, status: response.status };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected network error occurred";

    console.error(`[medusaFetch] ${method} ${url} →`, message);

    return { data: null, error: message, status: 0 };
  }
}
