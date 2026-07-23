/**
 * StatCard — a KPI tile for dashboard-style pages.
 *
 * Shows a muted label, a large value, an optional icon chip and an optional
 * hint line. While `isLoading` is true a skeleton is rendered instead of a
 * misleading zero so the layout never shifts and users never see fake data.
 */

import React from "react"
import { Container, Skeleton, Text } from "@medusajs/ui"

interface StatCardProps {
  label: string
  value?: React.ReactNode
  hint?: string
  icon?: React.ReactNode
  isLoading?: boolean
  /** Accent color for the icon chip. Defaults to neutral. */
  tone?: "neutral" | "green" | "orange" | "red" | "blue"
}

const toneClasses: Record<NonNullable<StatCardProps["tone"]>, string> = {
  neutral: "bg-ui-bg-subtle text-ui-fg-subtle",
  green: "bg-ui-tag-green-bg text-ui-tag-green-icon",
  orange: "bg-ui-tag-orange-bg text-ui-tag-orange-icon",
  red: "bg-ui-tag-red-bg text-ui-tag-red-icon",
  blue: "bg-ui-tag-blue-bg text-ui-tag-blue-icon",
}

export const StatCard = ({
  label,
  value,
  hint,
  icon,
  isLoading = false,
  tone = "neutral",
}: StatCardProps) => (
  <Container className="p-4">
    <div className="flex items-center justify-between gap-2">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      {icon ? (
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ${toneClasses[tone]}`}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
    </div>
    {isLoading ? (
      <Skeleton className="mt-2 h-7 w-20" />
    ) : (
      <div className="txt-compact-xlarge font-semibold mt-1.5 text-ui-fg-base">
        {value ?? "—"}
      </div>
    )}
    {hint ? (
      isLoading ? (
        <Skeleton className="mt-1.5 h-3 w-28" />
      ) : (
        <Text size="xsmall" className="text-ui-fg-muted mt-1">
          {hint}
        </Text>
      )
    ) : null}
  </Container>
)

export default StatCard
