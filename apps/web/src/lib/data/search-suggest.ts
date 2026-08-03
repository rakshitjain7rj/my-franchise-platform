/**
 * Shared search types + client helper for header typeahead.
 *
 * Types/constants are safe to import from Server Components and Route Handlers.
 * `fetchSearchSuggestions` is browser-facing (calls the Next.js /api/search BFF).
 */

export const SEARCH_MIN_Q = 2;
export const SEARCH_DEFAULT_LIMIT = 6;
export const SEARCH_MAX_LIMIT = 12;

export type SearchHit = {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
  price: string | null;
};

export type SearchSuggestResponse = {
  products: SearchHit[];
  count: number;
};

export function isSearchableQuery(q: string): boolean {
  return q.trim().length >= SEARCH_MIN_Q;
}

/**
 * Belt-and-suspenders guard for typeahead result application.
 * Abort alone is not enough: a response can still land after the user has
 * typed further if cleanup races or the browser delivers a late body.
 */
export function shouldApplySearchResults(opts: {
  aborted: boolean;
  requestQuery: string;
  latestQuery: string;
}): boolean {
  if (opts.aborted) return false;
  if (opts.requestQuery !== opts.latestQuery) return false;
  if (!isSearchableQuery(opts.latestQuery)) return false;
  return true;
}

/**
 * Catalogue draft is write-only while the field is focused.
 * URL → draft only when unfocused (history, external nav, chips).
 */
export function shouldSyncSearchDraftFromUrl(focused: boolean): boolean {
  return !focused;
}

/**
 * Catalogue live-search commit value.
 * Returns `null` when the draft is a single character mid-typing (skip URL write).
 * Empty string means “clear q”.
 */
export function catalogueSearchCommitValue(draft: string): string | null {
  const trimmed = draft.trim();
  if (trimmed.length === 1) return null;
  return trimmed;
}

/**
 * Fetches product suggestions for the given query.
 * Pass an AbortSignal so callers can cancel when the user keeps typing.
 */
export async function fetchSearchSuggestions(
  query: string,
  options?: { limit?: number; signal?: AbortSignal }
): Promise<SearchSuggestResponse> {
  const q = query.trim();
  if (!isSearchableQuery(q)) {
    return { products: [], count: 0 };
  }

  const limit = options?.limit ?? SEARCH_DEFAULT_LIMIT;
  const params = new URLSearchParams({
    q,
    limit: String(limit),
  });

  const res = await fetch(`/api/search?${params.toString()}`, {
    method: "GET",
    signal: options?.signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    return { products: [], count: 0 };
  }

  const json = (await res.json()) as SearchSuggestResponse;
  return {
    products: Array.isArray(json.products) ? json.products : [],
    count: typeof json.count === "number" ? json.count : 0,
  };
}
