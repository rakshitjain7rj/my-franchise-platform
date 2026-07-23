/**
 * FilterBar — consistent layout row for search + filters + actions.
 *
 * Sits under a PageHeader (or as its own section) and keeps filter controls
 * aligned with the same spacing/wrapping rules across list pages.
 */

import React from "react"

interface FilterBarProps {
  children: React.ReactNode
  /** Optional trailing slot (e.g. count badge, secondary action). */
  end?: React.ReactNode
  className?: string
  /** Accessible name for the filter region. */
  ariaLabel?: string
}

export const FilterBar = ({
  children,
  end,
  className = "",
  ariaLabel = "Filters",
}: FilterBarProps) => (
  <div
    role="search"
    aria-label={ariaLabel}
    className={[
      "flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-3",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
  >
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
      {children}
    </div>
    {end ? <div className="flex shrink-0 flex-wrap items-center gap-2">{end}</div> : null}
  </div>
)

export default FilterBar
