/**
 * SearchInput — a consistent search field with a leading icon and an
 * inline clear button. Controlled component.
 */

import { Input } from "@medusajs/ui"
import { MagnifyingGlass, XMarkMini } from "@medusajs/icons"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Accessible label (also used for the clear button). */
  ariaLabel?: string
  className?: string
}

export const SearchInput = ({
  value,
  onChange,
  placeholder = "Search…",
  ariaLabel = "Search",
  className = "",
}: SearchInputProps) => (
  <div className={`relative ${className}`}>
    <span
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-muted"
      aria-hidden
    >
      <MagnifyingGlass />
    </span>
    <Input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`pl-9 ${value ? "pr-8" : ""}`}
    />
    {value ? (
      <button
        type="button"
        onClick={() => onChange("")}
        aria-label={`Clear ${ariaLabel.toLowerCase()}`}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ui-fg-muted transition-colors hover:text-ui-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-bg-interactive"
      >
        <XMarkMini />
      </button>
    ) : null}
  </div>
)

export default SearchInput
