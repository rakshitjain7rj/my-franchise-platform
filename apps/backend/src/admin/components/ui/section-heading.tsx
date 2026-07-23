/**
 * SectionHeading — consistent in-page section header with an optional
 * right-side slot (timestamps, badges, actions).
 */

import React from "react"
import { Heading, Text } from "@medusajs/ui"

interface SectionHeadingProps {
  title: React.ReactNode
  description?: React.ReactNode
  aside?: React.ReactNode
  className?: string
}

export const SectionHeading = ({
  title,
  description,
  aside,
  className = "",
}: SectionHeadingProps) => (
  <div className={`flex flex-wrap items-start justify-between gap-2 ${className}`}>
    <div className="min-w-0">
      <Heading level="h2">{title}</Heading>
      {description ? (
        <Text size="small" className="text-ui-fg-subtle mt-1">
          {description}
        </Text>
      ) : null}
    </div>
    {aside ? <div className="shrink-0">{aside}</div> : null}
  </div>
)

export default SectionHeading
