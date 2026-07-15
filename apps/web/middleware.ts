import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Subdomain → franchise ID mapping
// Add an entry here whenever a new franchise is onboarded.
// The DEFAULT_FRANCHISE_ID is read from the env var so it can be changed
// without a code deploy (useful during migrations / new-franchise rollouts).
// ---------------------------------------------------------------------------

/**
 * The single live franchise ID. Comes from an env var so deployments for
 * new franchises don't require a code change. Falls back to the Sirhind
 * Anant Bakers franchise (the first real franchise in production).
 */
const LIVE_FRANCHISE_ID =
  process.env.NEXT_PUBLIC_DEFAULT_FRANCHISE_ID ??
  // Flagship Cakery — keep in sync with seed / docker env when possible.
  "fran_01KX3A21FPJKNT13V32C72RS2P";

const SUBDOMAIN_FRANCHISE_MAP: Record<string, string> = {
  // Primary live franchise
  sirhind: LIVE_FRANCHISE_ID,
  // Add more entries as additional franchises are onboarded:
  // amritsar: "fran_...",
};

/** The franchise served when no subdomain is present (e.g. localhost:3000). */
const DEFAULT_FRANCHISE_ID = LIVE_FRANCHISE_ID;

/**
 * The set of ALL currently valid franchise IDs known to this middleware.
 * Any cookie whose value is NOT in this set is treated as stale (e.g. a
 * deleted test franchise) and gets overwritten with the correct franchise for
 * the current subdomain / default. This prevents old browser sessions from
 * being permanently stuck on a ghost franchise.
 */
const KNOWN_FRANCHISE_IDS = new Set(Object.values(SUBDOMAIN_FRANCHISE_MAP));

// ---------------------------------------------------------------------------
// Bypass list — paths that never need franchise context
// ---------------------------------------------------------------------------

const BYPASS_PREFIXES = [
  "/map-routing", // franchise-picker page — always accessible
  "/_next/",      // Next.js internals (HMR, chunks, etc.)
  "/favicon",     // browser favicon requests
  "/api/",        // internal API routes
  "/icons/",      // PWA / app icons
  "/sw.js",       // service worker (must not rewrite cookies/headers noise)
  "/manifest",    // web app manifest (manifest.webmanifest)
  "/offline",     // PWA offline fallback page
];

/**
 * Static file extensions that should always be served directly.
 */
const STATIC_EXTENSIONS =
  /\.(ico|png|jpg|jpeg|svg|webp|gif|woff|woff2|ttf|css|js|map|webmanifest)$/i;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;

  // 1. Skip static assets.
  if (STATIC_EXTENSIONS.test(pathname)) {
    return NextResponse.next();
  }

  // 2. Skip bypass paths — never intercept these.
  if (BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // 3. Resolve which franchise ID should be active for this request.
  //
  //    Priority:
  //      a) Existing cookie — BUT only if it points at a franchise we still
  //         know about. Stale cookies from deleted test franchises are evicted
  //         so users are never stuck on a ghost franchise permanently.
  //      b) Subdomain mapping (e.g. "sirhind.localhost" → sirhind franchise).
  //      c) Default franchise (the primary / only live franchise).
  const existingCookie = request.cookies.get("franchise_id")?.value?.trim();

  // A cookie is valid only if its value is in the known-franchises set.
  // This evicts old test-franchise cookies without requiring users to manually
  // clear their cookies after a database reset or franchise deletion.
  const cookieIsValid =
    Boolean(existingCookie) && KNOWN_FRANCHISE_IDS.has(existingCookie!);

  let franchiseId: string;

  if (cookieIsValid) {
    // Valid, known franchise — honour the existing session choice.
    franchiseId = existingCookie!;
  } else {
    // Absent or stale cookie → derive from subdomain or fall back to default.
    const subdomain = resolveSubdomain(hostname);
    franchiseId =
      (subdomain && SUBDOMAIN_FRANCHISE_MAP[subdomain]) ??
      DEFAULT_FRANCHISE_ID;
  }

  // 4. Build the outgoing response.
  const response = NextResponse.next();

  // 4a. Propagate the franchise ID as a header for Server Components /
  //     Route Handlers that need it without re-parsing cookies.
  response.headers.set("x-franchise-id", franchiseId);

  // 4b. Persist the resolved franchise ID in a cookie so subsequent requests
  //     (and client-side code) can read it without hitting the middleware again.
  //     Also overwrites stale / mismatched cookies on every request so recovery
  //     is automatic — no manual cookie clearing required from users.
  if (!cookieIsValid || existingCookie !== franchiseId) {
    response.cookies.set("franchise_id", franchiseId, {
      path: "/",
      // Keep the cookie for the browser session; don't set maxAge/expires so
      // it acts as a session cookie that resets when the browser is closed.
      // Change to `maxAge: 60 * 60 * 24 * 7` if you want 7-day persistence.
      sameSite: "lax",
      httpOnly: false, // must be readable by client-side JS (BakerySidebar)
    });
  }

  // 4c. Persist the store location cookie when the user navigates with a
  //     `?store=<store_location_id>` query param (deep links / QR codes).
  //     `selected_store_location_id` is the canonical cookie name, shared with
  //     MapRoutingShell and BakerySidebar which set it on in-app selection.
  //     It is forwarded as `x-store-location-id` by getMedusaHeaders() /
  //     medusaFetch(), enabling per-store product filtering on the backend
  //     (see src/api/middlewares/filter-products-by-franchise.ts:259).
  const storeLocationParam = request.nextUrl.searchParams.get("store")?.trim();
  // Store cookies use a long max-age (~10y) so the shopper's bakery choice
  // persists until they pick another (browsers cannot set truly infinite cookies).
  const storeCookieOpts = {
    path: "/" as const,
    sameSite: "lax" as const,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365 * 10,
  };
  if (storeLocationParam) {
    response.cookies.set(
      "selected_store_location_id",
      storeLocationParam,
      storeCookieOpts
    );
    response.headers.set("x-store-location-id", storeLocationParam);
  } else {
    // 4d. First-time visitors: pre-select the franchise default bakery so cart,
    //     inventory, and product filters work on the first paint. Never overwrite
    //     an existing selection (user choice always wins).
    //
    //     Fail-open: if the backend is unreachable, the client-side
    //     DefaultStoreBootstrap component retries after hydration.
    const existingStore = request.cookies
      .get("selected_store_location_id")
      ?.value?.trim();
    if (!existingStore) {
      const defaultStore = await resolveDefaultStoreLocation(franchiseId);
      if (defaultStore) {
        response.cookies.set(
          "selected_store_location_id",
          defaultStore.id,
          storeCookieOpts
        );
        if (defaultStore.name) {
          response.cookies.set(
            "selected_store_name",
            defaultStore.name,
            storeCookieOpts
          );
        }
        response.headers.set("x-store-location-id", defaultStore.id);
      }
    } else {
      response.headers.set("x-store-location-id", existingStore);
    }
  }

  return response;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the franchise default store from Medusa.
 *
 * Uses the internal Docker service URL when available (MEDUSA_BACKEND_URL),
 * otherwise the public NEXT_PUBLIC URL. Failures are swallowed so a flaky
 * backend never blocks page delivery.
 */
async function resolveDefaultStoreLocation(
  franchiseId: string
): Promise<{ id: string; name?: string } | null> {
  const backendUrl = (
    process.env.MEDUSA_BACKEND_URL ??
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ??
    ""
  ).replace(/\/$/, "");

  if (!backendUrl || !franchiseId) return null;

  const publishableKey =
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_MEDUSA_API_KEY ??
    "";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(
      `${backendUrl}/store/franchises/${encodeURIComponent(franchiseId)}/default-location`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(publishableKey
            ? { "x-publishable-api-key": publishableKey }
            : {}),
        },
        // Fresh enough for admin default flips; cheap for first-time visitors.
        cache: "no-store",
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const body = (await res.json()) as {
      location?: { id?: string; name?: string } | null;
    };
    const id = body?.location?.id?.trim();
    if (!id) return null;
    return { id, name: body.location?.name };
  } catch {
    return null;
  }
}

/**
 * Given a hostname like "amritsar.localhost" or "amritsar.example.com",
 * returns "amritsar".  Returns null for bare hostnames ("localhost",
 * "example.com") that have no meaningful subdomain.
 */
function resolveSubdomain(hostname: string): string | null {
  // Strip port if present (e.g. "amritsar.localhost:3000" → "amritsar.localhost")
  const host = hostname.split(":")[0];
  const parts = host.split(".");

  // Need at least 2 labels for a subdomain to exist.
  if (parts.length < 2) return null;

  // Common local development patterns: "amritsar.localhost"
  // Production pattern:               "amritsar.example.com"
  const candidate = parts[0];

  // Reject obviously non-subdomain first labels.
  if (candidate === "www" || candidate === "") return null;

  return candidate;
}

// ---------------------------------------------------------------------------
// Matcher config
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - _next/static  (static files)
     *  - _next/image   (image optimisation)
     *  - favicon.ico / PWA service worker / icons
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|icons/).*)",
  ],
};
