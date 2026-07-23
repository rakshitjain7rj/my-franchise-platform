/**
 * EmptyState — explains *why* a page/list is empty and *how to fix it*.
 *
 * Every empty screen gets: an icon, a plain-language title, a helpful
 * description, and (optionally) a primary and a secondary call to action.
 */

import React from "react"
import { Button, Heading, Text } from "@medusajs/ui"

interface EmptyStateAction {
  label: string
  onClick: () => void
  isLoading?: boolean
}

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  primaryAction?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  /** Render inside a dashed frame (default) or plain. */
  framed?: boolean
  className?: string
}

export const EmptyState = ({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  framed = true,
  className = "",
}: EmptyStateProps) => (
  <div
    role="status"
    className={[
      "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
      framed ? "rounded-lg border border-dashed border-ui-border-strong" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
  >
    {icon ? (
      <span
        className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-ui-bg-subtle text-ui-fg-muted"
        aria-hidden
      >
        {icon}
      </span>
    ) : null}
    <Heading level="h3">{title}</Heading>
    {description ? (
      <Text size="small" className="text-ui-fg-subtle max-w-md">
        {description}
      </Text>
    ) : null}
    {primaryAction || secondaryAction ? (
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {primaryAction ? (
          <Button
            size="small"
            onClick={primaryAction.onClick}
            isLoading={primaryAction.isLoading}
          >
            {primaryAction.label}
          </Button>
        ) : null}
        {secondaryAction ? (
          <Button
            size="small"
            variant="secondary"
            onClick={secondaryAction.onClick}
            isLoading={secondaryAction.isLoading}
          >
            {secondaryAction.label}
          </Button>
        ) : null}
      </div>
    ) : null}
  </div>
)

export default EmptyState
