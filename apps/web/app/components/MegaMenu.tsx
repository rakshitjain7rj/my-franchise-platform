"use client";

/**
 * Professional mega-menu for the Header "Cakes" nav item.
 * Groups categories by shape / occasion / seasonal (same taxonomy as the
 * catalogue sidebar) and deep-links into /cake-catalogue?cats=…
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ArrowRight, Cake } from "lucide-react";
import { getMedusaHeadersSync } from "@/lib/medusa/headers";

const BACKEND_URL =
  (typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
    : process.env.MEDUSA_BACKEND_URL ??
      process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "http://localhost:9000";

type Category = { id: string; name: string; handle: string };

type MenuItem = { label: string; handle: string };
type MenuGroup = { title: string; items: MenuItem[] };

/** Canonical taxonomy — mirrors cake-catalogue sidebar groups. */
const MENU_GROUPS: MenuGroup[] = [
  {
    title: "By shape & style",
    items: [
      { label: "Round Cakes", handle: "round-cakes" },
      { label: "Square Cakes", handle: "square-cakes" },
      { label: "Tall Cakes", handle: "tall-cakes" },
      { label: "Heart Cakes", handle: "heart-cake" },
      { label: "Icing Cakes", handle: "icing-cakes" },
      { label: "Novelty / Kids", handle: "novelty-kids-cakes" },
      { label: "Number Cakes", handle: "number-cakes" },
      { label: "Tiered Cakes", handle: "tiered-cakes" },
      { label: "Tray Cakes", handle: "tray-cakes" },
      { label: "Doll Cakes", handle: "doll-cakes" },
    ],
  },
  {
    title: "By occasion",
    items: [
      { label: "Wedding Cakes", handle: "wedding-cakes" },
      { label: "Baby Shower", handle: "baby-shower-cakes" },
      { label: "Graduation", handle: "graduation-cakes" },
      { label: "Click & Collect", handle: "click-and-collect" },
      { label: "Umrah & Hajj", handle: "umrah-and-hajj-mubarak-cake" },
    ],
  },
  {
    title: "Seasonal",
    items: [
      { label: "Christmas", handle: "christmas" },
      { label: "Eid", handle: "eid-cakes" },
      { label: "Diwali", handle: "diwali-cakes" },
      { label: "Valentine's Day", handle: "valentines" },
      { label: "Mother's Day", handle: "mothers-day-cakes" },
      { label: "Father's Day", handle: "fathers-day-cakes" },
      { label: "Easter", handle: "easter" },
      { label: "Lohri", handle: "lohri-cakes" },
      { label: "Vaisakhi", handle: "vaisakhi-cakes" },
      { label: "Raksha Bandhan", handle: "raksha-bandhan" },
    ],
  },
];

const DEMO_HANDLES = new Set(["shirts", "sweatshirts", "pants", "merch"]);

type MegaMenuProps = {
  mobile?: boolean;
  onNavigate?: () => void;
};

function catHref(handle: string) {
  return `/cake-catalogue?cats=${encodeURIComponent(handle)}`;
}

const PANEL_MAX_WIDTH = 860;
const VIEWPORT_GUTTER = 16;

export default function MegaMenu({ mobile = false, onNavigate }: MegaMenuProps) {
  const [open, setOpen] = useState(false);
  /** Handles known to exist in Medusa (null = still loading / use all curated). */
  const [liveHandles, setLiveHandles] = useState<Set<string> | null>(null);
  /** Fixed-position coords so the panel never clips off the left/right of the viewport. */
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: VIEWPORT_GUTTER,
    width: PANEL_MAX_WIDTH,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const repositionPanel = () => {
    if (typeof window === "undefined" || !rootRef.current) return;

    const trigger = rootRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(PANEL_MAX_WIDTH, vw - VIEWPORT_GUTTER * 2);

    // Prefer centering under the "Cakes" trigger…
    let left = trigger.left + trigger.width / 2 - width / 2;
    // …then clamp so the full panel stays inside the viewport.
    left = Math.max(VIEWPORT_GUTTER, Math.min(left, vw - width - VIEWPORT_GUTTER));

    setPanelPos({
      top: trigger.bottom + 10,
      left,
      width,
    });
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const headers = getMedusaHeadersSync();
        const res = await fetch(
          `${BACKEND_URL}/store/product-categories?limit=100&fields=id,name,handle`,
          { headers, cache: "no-store" }
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          product_categories?: Category[];
        };
        const handles = new Set(
          (json.product_categories ?? [])
            .filter((c) => !DEMO_HANDLES.has(c.handle))
            .map((c) => c.handle)
        );
        if (!cancelled) setLiveHandles(handles);
      } catch {
        // Keep curated list fully visible if fetch fails
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mobile || !open) return;

    repositionPanel();
    const onResize = () => repositionPanel();
    const onScroll = () => repositionPanel();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [mobile, open]);

  useEffect(() => {
    if (mobile) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [mobile]);

  const scheduleClose = () => {
    if (mobile) return;
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const openMenu = () => {
    cancelClose();
    repositionPanel();
    setOpen(true);
  };

  /** Prefer curated labels; only show items that exist in Medusa when we know. */
  const groups = MENU_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => liveHandles === null || liveHandles.has(item.handle)
    ),
  })).filter((g) => g.items.length > 0);

  const navigate = () => {
    setOpen(false);
    onNavigate?.();
  };

  // ── Mobile accordion ────────────────────────────────────────────────────
  if (mobile) {
    return (
      <div className="border-b border-purple-50 pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between py-1 text-base font-semibold text-deep-plum"
          aria-expanded={open}
        >
          Cakes
          <ChevronDown
            className={`h-4 w-4 text-deep-plum/60 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {open && (
          <div className="mt-3 space-y-4 rounded-2xl border border-outline-variant/40 bg-lavender-bg/40 p-4">
            <Link
              href="/cake-catalogue"
              onClick={navigate}
              className="flex items-center justify-between rounded-xl bg-deep-plum px-4 py-3 text-sm font-semibold text-white"
            >
              Browse all cakes
              <ArrowRight className="h-4 w-4" />
            </Link>

            {groups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-vibrant-magenta">
                  {group.title}
                </p>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {group.items.map((item) => (
                    <li key={item.handle}>
                      <Link
                        href={catHref(item.handle)}
                        onClick={navigate}
                        className="block rounded-lg py-1.5 text-sm font-medium text-deep-plum/90 transition-colors hover:text-vibrant-magenta"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop mega panel ──────────────────────────────────────────────────
  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <Link
        href="/cake-catalogue"
        className={`relative inline-flex items-center gap-1 py-1.5 text-sm font-semibold tracking-wide transition-colors duration-200 ${
          open ? "text-deep-plum" : "text-gray-600 hover:text-deep-plum"
        }`}
        onFocus={openMenu}
        aria-haspopup="true"
        aria-expanded={open}
      >
        Cakes
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            open ? "rotate-180 text-vibrant-magenta" : ""
          }`}
        />
        <span
          className={`absolute bottom-0 left-0 h-[2px] w-full origin-center rounded-full bg-gradient-to-r from-deep-plum to-vibrant-magenta transition-transform duration-300 ${
            open ? "scale-x-100" : "scale-x-0"
          }`}
        />
      </Link>

      {/*
        Fixed positioning (not absolute + -translate-x-1/2 on the trigger).
        Absolute centering under "Cakes" (mid-left of the nav) pushed half the
        panel off-screen to the left. We measure the trigger, prefer centering
        under it, then clamp left so the full panel stays in the viewport.
      */}
      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Cake categories"
          className="fixed z-[80]"
          style={{
            top: panelPos.top,
            left: panelPos.left,
            width: panelPos.width,
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-white shadow-[0_24px_60px_rgba(74,21,75,0.14)]">
            {/* Header strip */}
            <div className="flex items-center justify-between gap-3 border-b border-outline-variant/40 bg-gradient-to-r from-[#F8F1FC] to-[#FDF2F8] px-5 py-3.5 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-deep-plum/10 text-deep-plum">
                  <Cake className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-deep-plum">Shop cakes</p>
                  <p className="text-[11px] text-on-surface-variant">
                    Shape · occasion · seasonal
                  </p>
                </div>
              </div>
              <Link
                href="/cake-catalogue"
                onClick={navigate}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-deep-plum px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-vibrant-magenta sm:px-4"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Columns */}
            <div className="grid grid-cols-1 gap-0 sm:grid-cols-3 sm:divide-x sm:divide-outline-variant/30">
              {groups.map((group) => (
                <div key={group.title} className="px-4 py-4 sm:px-5 sm:py-5">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-vibrant-magenta">
                    {group.title}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.handle}>
                        <Link
                          href={catHref(item.handle)}
                          onClick={navigate}
                          className="group/link flex items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium text-deep-plum/85 transition-colors hover:bg-lavender-bg hover:text-deep-plum"
                        >
                          <span>{item.label}</span>
                          <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-vibrant-magenta opacity-0 transition-all group-hover/link:translate-x-0 group-hover/link:opacity-100" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Footer CTA */}
            <div className="flex flex-col gap-2 border-t border-outline-variant/40 bg-lavender-bg/40 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
              <p className="text-xs text-on-surface-variant">
                Fresh, eggless cakes made to order at your local bakery.
              </p>
              <Link
                href="/contact"
                onClick={navigate}
                className="shrink-0 text-xs font-bold uppercase tracking-wider text-deep-plum transition-colors hover:text-vibrant-magenta"
              >
                Custom order →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
