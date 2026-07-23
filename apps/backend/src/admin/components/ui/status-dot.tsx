/**
 * StatusDot — a small colored indicator with an optional label.
 *
 * Used for active/inactive, open/paused, healthy/unhealthy, and similar
 * binary or multi-state signals without the visual weight of a Badge.
 */

import React from "react"
import { Text } from "@medusajs/ui"

export type StatusDotTone = "green" | "red" | "orange" | "blue" | "grey"

interface StatusDotProps {
  tone?: StatusDotTone
  /** Visible label next to the dot. */
  label?: React.ReactNode
  /** Accessible label when no visible label is provided. */
  ariaLabel?: string
  size?: "sm" | "md"
  className?: string
}

const toneClasses: Record<StatusDotTone, string> = {
  green: "bg-ui-tag-green-icon",
  red: "bg-ui-tag-red-icon",
  orange: "bg-ui-tag-orange-icon",
  blue: "bg-ui-tag-blue-icon",
  grey: "bg-ui-fg-muted",
}

const sizeClasses = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
}

export const StatusDot = ({
  tone = "grey",
  label,
  ariaLabel,
  size = "sm",
  className = "",
}: StatusDotProps) => (
  <span
    className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}
    role={label ? undefined : "img"}
    aria-label={label ? undefined : ariaLabel}
  >
    <span
      className={`shrink-0 rounded-full ${sizeClasses[size]} ${toneClasses[tone]}`}
      aria-hidden
    />
    {label != null && label !== "" ? (
      typeof label === "string" || typeof label === "number" ? (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {label}
        </Text>
      ) : (
        label
      )
    ) : null}
  </span>
)

export default StatusDot
