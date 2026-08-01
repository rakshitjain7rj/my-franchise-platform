"use client";

/**
 * Header search — global jump into the cake catalogue.
 * Shown everywhere except cake catalogue (parent Header hides it there;
 * the catalogue page has its own live search field).
 *
 * Submit with a query → /cake-catalogue?q=…
 * Empty submit / search icon → /cake-catalogue?focus=search (focuses catalogue input)
 */

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

function catalogueSearchHref(query: string): string {
  const q = query.trim();
  if (q) {
    return `/cake-catalogue?q=${encodeURIComponent(q)}`;
  }
  return "/cake-catalogue?focus=search";
}

type HeaderSearchProps = {
  /** Compact icon-only on very small screens; full field from sm up. */
  className?: string;
  onNavigate?: () => void;
};

export default function HeaderSearch({
  className = "",
  onNavigate,
}: HeaderSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState("");

  const go = (query: string) => {
    onNavigate?.();
    router.push(catalogueSearchHref(query));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    go(value);
  };

  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className={`flex items-center ${className}`}
      aria-label="Search cakes"
    >
      <div className="relative flex w-full items-center">
        <button
          type="submit"
          className="absolute left-2.5 z-[1] flex h-8 w-8 items-center justify-center rounded-full text-purple-600 hover:bg-purple-50 hover:text-purple-900 transition-colors"
          aria-label={
            value.trim()
              ? `Search for ${value.trim()}`
              : "Open cake catalogue search"
          }
          title="Search cakes"
        >
          <Search className="h-4 w-4 md:h-[18px] md:w-[18px]" strokeWidth={2.25} />
        </button>
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search cakes…"
          autoComplete="off"
          enterKeyHint="search"
          className="h-10 w-full min-w-0 rounded-full border border-purple-100 bg-purple-50/40 pl-11 pr-3.5 text-sm font-medium text-purple-950 placeholder:text-purple-400/80 transition-all focus:border-purple-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200/60 sm:w-44 md:w-52 lg:w-64"
        />
      </div>
    </form>
  );
}
