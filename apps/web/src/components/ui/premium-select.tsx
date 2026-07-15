"use client";

/**
 * PremiumSelect — shared pill / listbox dropdown used by catalogue filters
 * and product detail customisation fields.
 *
 * Matches the Cake Break “Modern Confectionery” filter control language:
 * rounded-full trigger, soft plum shadow panel, check on selected row.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type PremiumSelectOption = {
  value: string;
  label: string;
  /** Optional secondary line (e.g. store address). */
  description?: string;
};

export type PremiumSelectProps = {
  label: string;
  value: string;
  placeholder?: string;
  options: PremiumSelectOption[];
  onChange: (value: string) => void;
  /** When true, trigger uses the filled deep-plum active style. */
  active?: boolean;
  disabled?: boolean;
  /** Stretch trigger and panel to full container width. */
  fullWidth?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
};

export function PremiumSelect({
  label,
  value,
  placeholder = "Select",
  options,
  onChange,
  active,
  disabled = false,
  fullWidth = false,
  className,
  triggerClassName,
  contentClassName,
}: PremiumSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const selectedLabel = selected?.label ?? placeholder;
  const isActive = Boolean(active ?? value);

  return (
    <div
      ref={rootRef}
      className={cn("relative", fullWidth && "w-full", className)}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        className={cn(
          "group inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold tracking-wide transition-all duration-200",
          fullWidth && "h-10 w-full justify-between text-sm",
          disabled && "cursor-not-allowed opacity-55",
          isActive
            ? "border-deep-plum/25 bg-deep-plum text-white shadow-[0_4px_14px_-4px_rgba(74,21,75,0.45)]"
            : "border-outline-variant/50 bg-white text-deep-plum shadow-[0_1px_2px_rgba(74,21,75,0.04)] hover:border-deep-plum/30 hover:shadow-[0_4px_12px_-4px_rgba(74,21,75,0.12)]",
          triggerClassName
        )}
      >
        <span
          className={cn(
            "truncate text-left",
            fullWidth ? "min-w-0 flex-1" : "max-w-[9.5rem]"
          )}
        >
          {selectedLabel}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && !disabled && (
        <ul
          role="listbox"
          aria-label={label}
          className={cn(
            "absolute left-0 z-40 mt-2 overflow-hidden rounded-2xl border border-outline-variant/40 bg-white py-1.5 shadow-[0_16px_40px_-12px_rgba(74,21,75,0.22)] ring-1 ring-deep-plum/5",
            fullWidth
              ? "w-full min-w-0 max-h-64 overflow-y-auto"
              : "min-w-[11.5rem] max-h-64 overflow-y-auto",
            contentClassName
          )}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <li key={opt.value || "__any"}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 px-3.5 py-2 text-left transition-colors",
                    isSelected
                      ? "bg-lavender-bg font-semibold text-deep-plum"
                      : "text-on-surface-variant hover:bg-lavender-bg/70 hover:text-deep-plum"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug">
                      {opt.label}
                    </span>
                    {opt.description && (
                      <span className="mt-0.5 block text-[11px] font-normal leading-snug text-on-surface-variant/80">
                        {opt.description}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vibrant-magenta" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default PremiumSelect;
