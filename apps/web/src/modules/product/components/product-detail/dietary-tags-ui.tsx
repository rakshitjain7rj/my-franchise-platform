import { CheckIcon } from "./icons";
import type { DietaryTag } from "./types";

/** Compact emerald badges for the purchase panel title block. */
export function DietaryTagBadges({ tags }: { tags: DietaryTag[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {tags.map((tag) => (
        <span
          key={tag.id}
          title={tag.description ?? undefined}
          className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold uppercase tracking-wider"
        >
          {tag.name}
        </span>
      ))}
    </div>
  );
}

/** Full dietary rows for the Dietary & Allergens info card. */
export function DietaryTagInfoRows({ tags }: { tags: DietaryTag[] }) {
  if (tags.length === 0) return null;

  return (
    <>
      {tags.map((tag) => (
        <div
          key={tag.id}
          className="flex items-center gap-3 bg-white border border-emerald-200/60 rounded-2xl p-3 shadow-sm text-emerald-800 text-sm font-semibold"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 shrink-0">
            <CheckIcon />
          </div>
          <div className="min-w-0">
            <span>{tag.name}</span>
            {tag.description && (
              <p className="text-xs font-normal text-on-surface-variant truncate">
                {tag.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

export function DietaryTagsBadgesSkeleton() {
  return (
    <div className="flex flex-wrap gap-2 pt-1 animate-pulse" aria-hidden>
      <div className="h-7 w-16 rounded-full bg-deep-plum/10" />
      <div className="h-7 w-20 rounded-full bg-deep-plum/10" />
    </div>
  );
}
