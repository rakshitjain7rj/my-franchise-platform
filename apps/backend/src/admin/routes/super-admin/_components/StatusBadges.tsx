import React from "react"
import { Text } from "@medusajs/ui"

// ---------------------------------------------------------------------------
// FranchiseStatus — active / inactive dot indicator
// ---------------------------------------------------------------------------

export const FranchiseStatus = ({ active }: { active: boolean }) => {
  return active ? (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      <Text size="xsmall" className="text-ui-fg-subtle">Active</Text>
    </div>
  ) : (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      <Text size="xsmall" className="text-ui-fg-subtle">Inactive</Text>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LocationStatus — three-state: inactive / paused / open
// ---------------------------------------------------------------------------

export const LocationStatus = ({
  active,
  accepting,
}: {
  active: boolean
  accepting: boolean
}) => {
  if (!active) {
    return (
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <Text size="xsmall" className="text-ui-fg-subtle">Inactive</Text>
      </div>
    )
  }
  if (!accepting) {
    return (
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        <Text size="xsmall" className="text-ui-fg-subtle">Active (Paused)</Text>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      <Text size="xsmall" className="text-ui-fg-subtle">Active (Open)</Text>
    </div>
  )
}
