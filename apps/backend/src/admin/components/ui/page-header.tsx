/**
 * PageHeader — the standard header row for every admin page/panel.
 *
 * Renders a title, optional description, and a right-aligned actions slot
 * with consistent spacing and responsive stacking (title above actions on
 * small screens, side-by-side from `md` up).
 *
 * Designed to sit as the first child of a `<Container className="divide-y p-0">`.
 */

import React from "react"
import { Heading, Text } from "@medusajs/ui"

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Right-aligned action area (buttons, switchers, badges…). */
  actions?: React.ReactNode
}

export const PageHeader = ({ title, description, actions }: PageHeaderProps) => (
  <div className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
    <div className="min-w-0">
      <Heading level="h1" className="truncate">
        {title}
      </Heading>
      {description ? (
        <Text size="small" className="text-ui-fg-subtle mt-1">
          {description}
        </Text>
      ) : null}
    </div>
    {actions ? (
      <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
    ) : null}
  </div>
)

export default PageHeader
