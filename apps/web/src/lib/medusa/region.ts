/**
 * Shared default Medusa region resolution for calculated prices.
 *
 * Module-level promise so concurrent callers (catalogue, /api/search, etc.)
 * share a single /store/regions round-trip per process.
 */

const MEDUSA_BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ??
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ??
  "http://localhost:9000";

let regionIdPromise: Promise<string | null> | null = null;

/**
 * Fetches the first store region ID (cached in-process with Next revalidate).
 */
export function getDefaultRegionId(): Promise<string | null> {
  if (!regionIdPromise) {
    regionIdPromise = (async () => {
      try {
        const response = await fetch(`${MEDUSA_BACKEND_URL}/store/regions`, {
          headers: {
            "x-publishable-api-key":
              process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
              process.env.NEXT_PUBLIC_MEDUSA_API_KEY ??
              "",
          },
          next: { revalidate: 3600 },
        });
        if (!response.ok) return null;
        const json = (await response.json()) as {
          regions?: Array<{ id: string }>;
        };
        return json.regions?.[0]?.id ?? null;
      } catch (err) {
        console.error("[medusa/region] Failed to fetch default region:", err);
        return null;
      }
    })();
  }
  return regionIdPromise;
}
