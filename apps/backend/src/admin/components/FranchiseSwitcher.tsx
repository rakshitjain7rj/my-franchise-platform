/**
 * FranchiseSwitcher.tsx
 *
 * Dropdown that lets privileged users switch their active franchise context.
 *
 * Design decisions:
 * - Uses `@medusajs/ui` primitives (Select) to stay fully consistent with the
 *   Medusa admin design system – no extra dependencies needed.
 * - **Renders nothing when `allowedFranchiseIds.length <= 1`.**  Local managers
 *   who are assigned to a single branch never see the control; their scope is
 *   enforced transparently via the header injected by the SDK interceptor.
 * - The component is intentionally "dumb" – it reads from and writes to the
 *   FranchiseContext only; the actual API call is not its concern.
 * - `franchiseLabels` is an optional map of id → human-readable name so the
 *   dropdown can show franchise names rather than raw IDs.  If no label is
 *   provided for an ID we fall back to the ID itself.
 */

import React from "react"
import { Label, Select } from "@medusajs/ui"
import { useFranchise } from "../providers/FranchiseContext"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FranchiseSwitcherProps {
  /**
   * Optional map of franchise_id → display name.
   * If omitted the raw ID is displayed instead.
   */
  franchiseLabels?: Record<string, string>
  /** Additional className forwarded to the root wrapper element. */
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FranchiseSwitcher: React.FC<FranchiseSwitcherProps> = ({
  franchiseLabels = {},
  className,
}) => {
  const { activeFranchiseId, allowedFranchiseIds, setActiveFranchiseId } =
    useFranchise()

  // ⬇️  Hard rule: hide the switcher for single-franchise users.
  if (allowedFranchiseIds.length <= 1) return null

  const handleChange = (value: string) => {
    try {
      setActiveFranchiseId(value)
    } catch (err) {
      console.error("[FranchiseSwitcher]", err)
    }
  }

  return (
    <div
      className={[
        "flex items-center gap-x-2",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Label
        htmlFor="franchise-switcher"
        size="xsmall"
        className="text-ui-fg-muted whitespace-nowrap"
      >
        Branch
      </Label>

      <Select
        value={activeFranchiseId ?? ""}
        onValueChange={handleChange}
      >
        <Select.Trigger id="franchise-switcher" className="w-[220px]">
          <Select.Value placeholder="Select a branch…" />
        </Select.Trigger>

        <Select.Content>
          {allowedFranchiseIds.map((id) => (
            <Select.Item key={id} value={id}>
              {franchiseLabels[id] ?? id}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </div>
  )
}

export default FranchiseSwitcher
