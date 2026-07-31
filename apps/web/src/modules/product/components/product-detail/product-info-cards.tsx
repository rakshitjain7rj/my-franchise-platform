import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { CheckIcon, getAllergenIcon } from "./icons";
import type { DietaryTag } from "./types";
import type { ProductCareNotice } from "@/lib/product-care-notices";

interface ProductInfoCardsProps {
  ingredientsText: string | null;
  allergenLabels: string[];
  storageText: string | null;
  dietaryTags: DietaryTag[];
  /** When set, replaces the default dietary tag rows (streamed RSC slot). */
  dietaryInfoSlot?: ReactNode;
  /** Photo / chocolate (and future) care disclaimers. */
  careNotices?: ProductCareNotice[];
}

export function ProductInfoCards({
  ingredientsText,
  allergenLabels,
  storageText,
  dietaryTags,
  dietaryInfoSlot,
  careNotices = [],
}: ProductInfoCardsProps) {
  return (
    <div className="space-y-4 pt-10 border-t border-outline-variant/20">
    {careNotices.length > 0 && (
      <div className="grid grid-cols-1 gap-3">
        {careNotices.map((notice) => (
          <div
            key={notice.kind}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 shadow-sm"
            role="note"
          >
            <p className="font-headline text-sm font-extrabold uppercase tracking-wider text-rose-900">
              {notice.title}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-rose-950/90">
              {notice.body}
            </p>
          </div>
        ))}
      </div>
    )}
    <div className="grid grid-cols-1 md:grid-cols-[35%_30%_35%] gap-4">
      <div className="bg-[#FBF5FB] border border-outline-variant/20 rounded-3xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 text-deep-plum font-bold">
          <svg className="w-5 h-5 text-deep-plum" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span className="text-lg font-headline-md uppercase tracking-wider">
            Ingredients
          </span>
        </div>
        <div className="flex flex-col gap-2.5 pt-1">
          {ingredientsText ? (
            ingredientsText
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
              .slice(0, 8)
              .map((ingredient, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 text-on-surface-variant text-sm font-medium"
                >
                  <CheckIcon />
                  <span className="truncate">{ingredient}</span>
                </div>
              ))
          ) : (
            <p className="text-sm text-on-surface-variant">
              Ingredient details are being updated for this cake.
            </p>
          )}
        </div>
      </div>

      <div className="bg-[#FFF0F8] border border-outline-variant/20 rounded-3xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 text-[#ac2471] font-bold">
          <AlertTriangle className="w-5 h-5 text-[#ac2471]" />
          <span className="text-lg font-headline-md uppercase tracking-wider">
            Dietary & Allergens
          </span>
        </div>
        <div className="flex flex-col gap-2.5 pt-1">
          {dietaryInfoSlot !== undefined
            ? dietaryInfoSlot
            : dietaryTags.map((tag) => (
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

          {allergenLabels.slice(0, 6).map((allergen) => (
            <div
              key={allergen}
              className="flex items-center gap-3 bg-white border border-outline-variant/20 rounded-2xl p-3 shadow-sm text-slate-700 text-sm font-semibold transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#FFF0F8] shrink-0">
                {getAllergenIcon(allergen)}
              </div>
              <span>{allergen}</span>
            </div>
          ))}

          {/* When dietary rows stream via slot, empty state is deferred until
              allergens are also empty and no metadata tags were provided. */}
          {allergenLabels.length === 0 &&
            dietaryTags.length === 0 &&
            dietaryInfoSlot === undefined && (
            <p className="text-sm text-on-surface-variant">
              Allergen information is available on request — please add a note
              in Special Instructions or contact your local bakery.
            </p>
          )}
        </div>
      </div>

      <div className="bg-[#F8F0FC] border border-outline-variant/20 rounded-3xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 text-deep-plum font-bold">
          <svg className="w-5 h-5 text-deep-plum" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-lg font-headline-md uppercase tracking-wider">
            Storage & Serving
          </span>
        </div>
        <p className="font-body-md text-on-surface-variant leading-relaxed text-sm">
          {storageText ||
            "Keep refrigerated and consume within 24 hours"}
        </p>
      </div>
    </div>
    </div>
  );
}
