import { StatusDot } from "../../../components/ui"

// ---------------------------------------------------------------------------
// FranchiseStatus — active / inactive indicator
// ---------------------------------------------------------------------------

export const FranchiseStatus = ({ active }: { active: boolean }) => (
  <StatusDot
    tone={active ? "green" : "red"}
    label={active ? "Active" : "Inactive"}
  />
)

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
    return <StatusDot tone="red" label="Inactive" />
  }
  if (!accepting) {
    return <StatusDot tone="orange" label="Active (Paused)" />
  }
  return <StatusDot tone="green" label="Active (Open)" />
}
