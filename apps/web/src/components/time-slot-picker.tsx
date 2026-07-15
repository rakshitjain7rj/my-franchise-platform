"use client";

/**
 * Date + 30-min time slot picker backed by GET /store/stores/:id/slots.
 * Controls match PremiumSelect styling used on product customisation fields.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultMinCollectionDate,
  fetchStoreSlots,
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
  const [leadHours, setLeadHours] = useState(24);

  const minDate = defaultMinCollectionDate(leadHours);

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
      setSlots(data.slots ?? []);
      setMessage(data.message ?? null);
      if (data.lead_time_hours) setLeadHours(data.lead_time_hours);

      // If current selection is not bookable, clear it
      const stillOk = (data.slots ?? []).some(
        (s) =>
          s.is_bookable &&
          (s.time === selectedTime || s.label === selectedTime)
      );
      if (selectedTime && !stillOk) {
        onSlotChange(null);
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

  // Ensure date is not before min
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
      return [{ value: "", label: "Loading slots…" }];
    }
    if (!storeLocationId) {
      return [{ value: "", label: "Select bakery first" }];
    }
    if (bookable.length === 0) {
      return [{ value: "", label: "No slots available" }];
    }
    return bookable.map((slot) => ({
      value: slot.time,
      label:
        slot.available_capacity <= 3
          ? `${slot.label} · ${slot.available_capacity} left`
          : slot.label,
    }));
  }, [loading, storeLocationId, bookable]);

  const dateActive = Boolean(date);
  const timeDisabled =
    !storeLocationId || loading || bookable.length === 0;

  return (
    <div className={cn("space-y-3", className)}>
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
                  ? "No slots available"
                  : "Select a time"
            }
            options={timeOptions.filter((o) => o.value !== "")}
            onChange={(v) => {
              const slot = slots.find((s) => s.time === v);
              if (slot) {
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
      {message && !error && bookable.length === 0 && (
        <p className="text-xs text-on-surface-variant">{message}</p>
      )}
      {leadHours > 0 && bookable.length > 0 && (
        <p className="text-[11px] text-on-surface-variant">
          Orders need at least {leadHours}h notice. Slots update with live
          bakery capacity.
        </p>
      )}
    </div>
  );
}
