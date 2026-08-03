/**
 * Pure guards for typeahead + catalogue URL sync.
 * Run: npx tsx src/lib/data/search-suggest.unit.test.ts
 */
import {
  catalogueSearchCommitValue,
  isSearchableQuery,
  SEARCH_MIN_Q,
  shouldApplySearchResults,
  shouldSyncSearchDraftFromUrl,
} from "./search-suggest";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// --- isSearchableQuery / SEARCH_MIN_Q ---
assert(SEARCH_MIN_Q === 2, "min q is 2");
assert(!isSearchableQuery(""), "empty not searchable");
assert(!isSearchableQuery(" "), "whitespace not searchable");
assert(!isSearchableQuery("c"), "single char not searchable");
assert(!isSearchableQuery(" c "), "single char trimmed not searchable");
assert(isSearchableQuery("co"), "two chars searchable");
assert(isSearchableQuery("  co  "), "trimmed two chars searchable");

// --- shouldApplySearchResults (typeahead stale guard) ---
assert(
  !shouldApplySearchResults({
    aborted: true,
    requestQuery: "coco",
    latestQuery: "coco",
  }),
  "aborted never applies"
);
assert(
  !shouldApplySearchResults({
    aborted: false,
    requestQuery: "coco",
    latestQuery: "cocomelon",
  }),
  "stale request query must not apply"
);
assert(
  !shouldApplySearchResults({
    aborted: false,
    requestQuery: "co",
    latestQuery: "c",
  }),
  "latest below min-q must not apply"
);
assert(
  shouldApplySearchResults({
    aborted: false,
    requestQuery: "coco",
    latestQuery: "coco",
  }),
  "matching non-aborted applies"
);

// --- shouldSyncSearchDraftFromUrl (catalogue focus gate) ---
assert(
  !shouldSyncSearchDraftFromUrl(true),
  "never URL→draft while focused (coco→melon clobber fix)"
);
assert(
  shouldSyncSearchDraftFromUrl(false),
  "URL→draft when unfocused (history / external nav)"
);

// --- catalogueSearchCommitValue ---
assert(catalogueSearchCommitValue("") === "", "empty clears q");
assert(catalogueSearchCommitValue("   ") === "", "whitespace clears q");
assert(
  catalogueSearchCommitValue("c") === null,
  "single char skips URL write mid-typing"
);
assert(
  catalogueSearchCommitValue(" c ") === null,
  "single char trimmed skips write"
);
assert(catalogueSearchCommitValue("co") === "co", "two chars commit");
assert(
  catalogueSearchCommitValue("  cocomelon  ") === "cocomelon",
  "trim on commit"
);

// Simulate coco → pause → melon: focused means no sync; commit is full draft
assert(
  !shouldSyncSearchDraftFromUrl(true) &&
    catalogueSearchCommitValue("cocomelon") === "cocomelon",
  "focused typing keeps draft authority; commit is full string"
);

console.log("search-suggest.unit.test.ts: all passed");
