"use client";

/**
 * Date + 30-min time slot picker backed by GET /store/stores/:id/slots.
 * Controls match PremiumSelect styling used on product customisation fields.
 *
 * Lead-blocked and full slots are shown disabled with a reason (not hidden).
 * Kitchen busy vs normal lead copy comes from the API `kitchen_busy` flag.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collectionLeadBanner,
  EARLY_COLLECTION_WHATSAPP_TEXT,
  fetchStoreSlots,
  formatCollectionDateHero,
  isEarlyCollectionSlot,
  slotUnbookableLabel,
  todayCollectionDate,
  whatsAppOrderHref,
  type StoreTimeSlot,
} from "@/lib/data/logistics";
import { PremiumSelect } from "@/components/ui/premium-select";
import { cn } from "@/lib/utils";

export type SlotSelection = {
  date: string;
  time: string; // HH:mm start
  end: string;
  label: string;
};

type TimeSlotPickerProps = {
  storeLocationId: string | null;
  date: string;
  selectedTime: string; // HH:mm or legacy label
  onDateChange: (date: string) => void;
  onSlotChange: (slot: SlotSelection | null) => void;
  /** Visual density — reserved for callers; layout is always a single row. */
  compact?: boolean;
  className?: string;
};

export default function TimeSlotPicker({
  storeLocationId,
  date,
  selectedTime,
  onDateChange,
  onSlotChange,
  compact = false,
  className = "",
}: TimeSlotPickerProps) {
  const [slots, setSlots] = useState<StoreTimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [leadHours, setLeadHours] = useState(0);
  const [kitchenBusy, setKitchenBusy] = useState(false);
  const [clearedNotice, setClearedNotice] = useState<string | null>(null);

  // Date picker min is today so lead-blocked days stay openable and show reasons.
  const minDate = todayCollectionDate();

  const load = useCallback(async () => {
    if (!storeLocationId || !date) {
      setSlots([]);
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await fetchStoreSlots(storeLocationId, date);
      const nextSlots = data.slots ?? [];
      setSlots(nextSlots);
      setMessage(data.message ?? null);
      // 0 is a valid "immediate" lead time — do not treat as falsy.
      if (typeof data.lead_time_hours === "number") {
        setLeadHours(data.lead_time_hours);
      }
      setKitchenBusy(Boolean(data.kitchen_busy));

      // If current selection is not bookable, clear it with a clear notice.
      const stillOk = nextSlots.some(
        (s) =>
          s.is_bookable &&
          (s.time === selectedTime || s.label === selectedTime)
      );
      if (selectedTime && !stillOk) {
        const dead = nextSlots.find(
          (s) => s.time === selectedTime || s.label === selectedTime
        );
        const leadForCopy =
          typeof data.lead_time_hours === "number" ? data.lead_time_hours : 0
        const reason = dead
          ? slotUnbookableLabel(dead, {
              leadHours: leadForCopy,
              kitchenBusy: Boolean(data.kitchen_busy),
            })
          : data.message ||
            (data.kitchen_busy
              ? "That time is no longer available — kitchen is busy."
              : "That time is no longer available. Please choose another slot.");
        setClearedNotice(reason);
        onSlotChange(null);
      } else if (selectedTime && stillOk) {
        setClearedNotice(null);
      }
    } catch (err) {
      setSlots([]);
      setError(
        err instanceof Error ? err.message : "Could not load time slots."
      );
    } finally {
      setLoading(false);
    }
  }, [storeLocationId, date, selectedTime, onSlotChange]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when the shopper returns to the tab (busy mode may have changed).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // Block past calendar days only (not the lead cutoff).
  useEffect(() => {
    if (date && date < minDate) {
      onDateChange(minDate);
    }
  }, [date, minDate, onDateChange]);

  const bookable = slots.filter((s) => s.is_bookable);

  const selectedSlotTime =
    slots.find((s) => s.time === selectedTime || s.label === selectedTime)
      ?.time ?? "";

  const timeOptions = useMemo(() => {
    if (loading) {
      return [{ value: "", label: "Loading slots…", disabled: true }];
    }
    if (!storeLocationId) {
      return [{ value: "", label: "Select bakery first", disabled: true }];
    }
    if (slots.length === 0) {
      return [{ value: "", label: "No slots available", disabled: true }];
    }
    return slots.map((slot) => {
      if (!slot.is_bookable) {
        const reason = slotUnbookableLabel(slot, { leadHours, kitchenBusy });
        return {
          value: slot.time,
          label: `${slot.label} · ${reason}`,
          description: reason,
          disabled: true,
        };
      }
      return {
        value: slot.time,
        label:
          slot.available_capacity <= 3
            ? `${slot.label} · ${slot.available_capacity} left`
            : slot.label,
        disabled: false,
      };
    });
  }, [loading, storeLocationId, slots, leadHours, kitchenBusy]);

  const dateActive = Boolean(date);
  const timeDisabled = !storeLocationId || loading || slots.length === 0;
  const banner = collectionLeadBanner({ leadHours, kitchenBusy });
  const dateHero = date ? formatCollectionDateHero(date) : null;
  const earlyWarning =
    Boolean(selectedSlotTime) && isEarlyCollectionSlot(selectedSlotTime);
  const earlyWhatsAppHref = whatsAppOrderHref(EARLY_COLLECTION_WHATSAPP_TEXT);

  return (
    <div className={cn("space-y-3", className)}>
      {banner && (
        <p
          className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
          role="status"
        >
          {banner}
        </p>
      )}

      {dateHero && (
        <div
          className="rounded-2xl border border-deep-plum/10 bg-gradient-to-br from-[#FBF5FB] to-white px-4 py-3 shadow-sm"
          aria-live="polite"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/80">
            Collection day
          </p>
          <p className="mt-1 font-headline text-deep-plum leading-none">
            <span className="block text-sm font-semibold tracking-wide text-on-surface-variant">
              {dateHero.weekday}
            </span>
            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0">
              <span className="text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">
                {dateHero.dayOrdinal}
              </span>
              <span className="text-lg font-bold text-deep-plum/90 sm:text-xl">
                {dateHero.month} {dateHero.year}
              </span>
            </span>
          </p>
        </div>
      )}

      <div
        className={cn(
          "grid grid-cols-2 items-end",
          compact ? "gap-3" : "gap-4"
        )}
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            Collection date
          </label>
          <input
            type="date"
            value={date}
            min={minDate}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={!storeLocationId}
            aria-label="Collection date"
            className={cn(
              // Match PremiumSelect fullWidth trigger (h-10, rounded-full pill)
              "h-10 w-full rounded-full border px-3.5 text-sm font-semibold tracking-wide transition-all duration-200",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-deep-plum/25 focus-visible:ring-offset-1",
              "disabled:cursor-not-allowed disabled:opacity-55",
              "[color-scheme:light]",
              // Keep calendar icon readable on filled active state
              dateActive && storeLocationId
                ? "border-deep-plum/25 bg-deep-plum text-white shadow-[0_4px_14px_-4px_rgba(74,21,75,0.45)] [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-90"
                : "border-outline-variant/50 bg-white text-deep-plum shadow-[0_1px_2px_rgba(74,21,75,0.04)] hover:border-deep-plum/30 hover:shadow-[0_4px_12px_-4px_rgba(74,21,75,0.12)]"
            )}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            Time slot
          </label>
          <PremiumSelect
            label="Time slot"
            value={selectedSlotTime}
            placeholder={
              loading
                ? "Loading slots…"
                : bookable.length === 0
                  ? "No bookable slots"
                  : "Select a time"
            }
            options={timeOptions.filter((o) => o.value !== "")}
            onChange={(v) => {
              const slot = slots.find((s) => s.time === v && s.is_bookable);
              if (slot) {
                setClearedNotice(null);
                onSlotChange({
                  date,
                  time: slot.time,
                  end: slot.end,
                  label: slot.label,
                });
              } else {
                onSlotChange(null);
              }
            }}
            active={Boolean(selectedSlotTime)}
            disabled={timeDisabled}
            fullWidth
          />
        </div>
      </div>

      {earlyWarning && (
        <div
          className="rounded-xl border-2 border-amber-400/90 bg-amber-50 px-3.5 py-3 text-sm text-amber-950 shadow-sm"
          role="status"
        >
          <p className="font-headline text-base font-extrabold tracking-tight text-amber-950">
            Early morning collection?
          </p>
          <p className="mt-1.5 text-xs font-semibold leading-relaxed sm:text-sm">
            If you place the order for early morning, please message us on{" "}
            <a
              href={earlyWhatsAppHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-extrabold underline decoration-2 underline-offset-2 text-[#128C7E] hover:text-[#075E54]"
            >
              WhatsApp first
            </a>{" "}
            — we may not be able to hand over the cake as soon as the shop
            opens.
          </p>
        </div>
      )}

      {!storeLocationId && (
        <p className="text-xs text-amber-700">
          Select a bakery location to see available collection slots.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      {clearedNotice && !error && (
        <p className="text-xs text-red-700" role="alert">
          {clearedNotice} Please pick another collection time.
        </p>
      )}
      {message && !error && bookable.length === 0 && !clearedNotice && (
        <p className="text-xs text-on-surface-variant">{message}</p>
      )}
    </div>
  );
}
