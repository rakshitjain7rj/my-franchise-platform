/**
 * FilterPills — a segmented control for mutually-exclusive filters.
 *
 * Replaces rows of primary/secondary buttons with a single calm control in
 * the style of Linear/Stripe filter bars. Keyboard accessible via native
 * buttons, with an optional count badge per option.
 */

export interface FilterPillOption<T extends string> {
  value: T
  label: string
  count?: number
}

interface FilterPillsProps<T extends string> {
  options: Array<FilterPillOption<T>>
  value: T
  onChange: (value: T) => void
  /** Accessible label for the group. */
  ariaLabel: string
}

export const FilterPills = <T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: FilterPillsProps<T>) => (
  <div
    role="group"
    aria-label={ariaLabel}
    className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-ui-bg-subtle p-1"
  >
    {options.map((option) => {
      const active = option.value === value
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(option.value)}
          className={[
            "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-bg-interactive",
            active
              ? "bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest"
              : "text-ui-fg-subtle hover:text-ui-fg-base",
          ].join(" ")}
        >
          {option.label}
          {typeof option.count === "number" && (
            <span
              className={`rounded-full px-1.5 text-xs leading-4 ${
                active
                  ? "bg-ui-bg-subtle text-ui-fg-subtle"
                  : "bg-ui-bg-base text-ui-fg-muted"
              }`}
            >
              {option.count}
            </span>
          )}
        </button>
      )
    })}
  </div>
)

export default FilterPills
