/**
 * SettingsPanel.tsx
 *
 * Local franchise configuration panel displayed at the bottom of the
 * Franchise Dashboard.  Lets kitchen managers toggle order-acceptance
 * mode and set a custom lead time without leaving the dashboard.
 *
 * Architecture
 * ------------
 * - Settings are persisted via a custom PATCH /admin/franchise-settings/:id
 *   endpoint (see src/api/admin/franchise-settings/[id]/route.ts).
 * - On mount a GET to the same endpoint rehydrates the form.
 * - The panel uses `@medusajs/ui` primitives exclusively so it blends
 *   seamlessly with the rest of the Medusa admin design system.
 * - `useMutation` from TanStack Query is used for the PATCH so the parent
 *   cache can be invalidated on success (optional but wired up).
 */

import React, { useEffect, useState } from "react"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useFranchiseFetch } from "../lib/sdk"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FranchiseSettings {
  /** When true the kitchen is accepting immediate orders. */
  accepting_immediate_orders: boolean
  /**
   * Custom lead time in hours.  0 means "use platform default".
   * Values above 0 are shown to the customer at checkout.
   */
  custom_lead_time_hours: number
  /** ISO timestamp of the last update — displayed to kitchen staff. */
  updated_at?: string
}

interface SettingsPanelProps {
  /** The franchise ID whose settings are managed by this panel. */
  franchiseId: string
}

// ---------------------------------------------------------------------------
// Helper — derived status badge
// ---------------------------------------------------------------------------

const StatusBadge: React.FC<{ accepting: boolean }> = ({ accepting }) =>
  accepting ? (
    <Badge color="green" size="xsmall">
      Kitchen Open
    </Badge>
  ) : (
    <Badge color="orange" size="xsmall">
      Extended Lead Time
    </Badge>
  )

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ franchiseId }) => {
  const franchiseFetch = useFranchiseFetch()
  const queryClient = useQueryClient()

  // ── Derived query key ──────────────────────────────────────────────────────
  const settingsKey = ["franchise-settings", franchiseId]

  // ── Local form state ───────────────────────────────────────────────────────
  const [acceptingOrders, setAcceptingOrders] = useState(true)
  const [leadTimeHours, setLeadTimeHours] = useState<string>("0")
  const [isDirty, setIsDirty] = useState(false)

  // ── GET – rehydrate form from the API ──────────────────────────────────────
  const { data: settings, isLoading: isLoadingSettings } =
    useQuery<FranchiseSettings>({
      queryKey: settingsKey,
      queryFn: () =>
        franchiseFetch(`/admin/franchise-settings/${franchiseId}`) as Promise<FranchiseSettings>,
      staleTime: 60_000, // settings change infrequently; 1-min stale window is fine
    })

  // Seed form values from the server whenever a fresh response arrives.
  useEffect(() => {
    if (!settings) return
    setAcceptingOrders(settings.accepting_immediate_orders)
    setLeadTimeHours(String(settings.custom_lead_time_hours ?? 0))
    setIsDirty(false)
  }, [settings])

  // ── PATCH – persist changes ────────────────────────────────────────────────
  const { mutate: saveSettings, isPending: isSaving } = useMutation({
    mutationFn: (payload: Partial<FranchiseSettings>) =>
      franchiseFetch(`/admin/franchise-settings/${franchiseId}`, {
        method: "PATCH",
        body: payload,
      }) as Promise<FranchiseSettings>,
    onSuccess: () => {
      // Invalidate both the settings cache and the dashboard overview so any
      // derived UI that reads settings also refreshes.
      queryClient.invalidateQueries({ queryKey: settingsKey })
      queryClient.invalidateQueries({ queryKey: ["franchise-dashboard"] })
      setIsDirty(false)
      toast.success("Settings saved", {
        description: "Franchise settings updated successfully.",
        duration: 3000,
      })
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred."
      toast.error("Failed to save settings", { description: message })
    },
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleToggle = (checked: boolean) => {
    setAcceptingOrders(checked)
    setIsDirty(true)
  }

  const handleLeadTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLeadTimeHours(e.target.value)
    setIsDirty(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const parsedHours = parseFloat(leadTimeHours)
    if (!Number.isFinite(parsedHours) || parsedHours < 0) {
      toast.error("Invalid lead time", {
        description: "Please enter a non-negative number of hours.",
      })
      return
    }

    saveSettings({
      accepting_immediate_orders: acceptingOrders,
      custom_lead_time_hours: parsedHours,
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Container className="p-0">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-ui-border-base px-6 py-4">
        <div>
          <Heading level="h2">Local Franchise Settings</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-0.5">
            Configure kitchen availability and order lead time for this branch.
          </Text>
        </div>
        <StatusBadge accepting={acceptingOrders} />
      </div>

      {/* Form body */}
      <form onSubmit={handleSubmit} className="divide-y divide-ui-border-base">
        {/* ── Toggle: Accepting Immediate Orders ── */}
        <div className="flex items-start justify-between gap-6 px-6 py-5">
          <div className="flex-1">
            <Label
              htmlFor="accepting-orders-toggle"
              size="base"
              className="font-medium"
            >
              Accepting Immediate Orders
            </Label>
            <Text size="small" className="text-ui-fg-subtle mt-1 max-w-prose">
              When enabled, the kitchen signals that it can fulfil orders
              immediately using the standard platform lead time.  Disable this
              to activate "Kitchen Busy" mode, which extends all customer-facing
              lead times by the value set below.
            </Text>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <Switch
              id="accepting-orders-toggle"
              checked={acceptingOrders}
              onCheckedChange={handleToggle}
              disabled={isLoadingSettings}
            />
            <Text
              size="xsmall"
              className={
                acceptingOrders ? "text-ui-fg-interactive" : "text-ui-fg-subtle"
              }
            >
              {acceptingOrders ? "Open" : "Busy"}
            </Text>
          </div>
        </div>

        {/* ── Lead Time Input ── */}
        <div className="px-6 py-5">
          <div className="max-w-sm">
            <Label
              htmlFor="lead-time-input"
              size="base"
              className="font-medium mb-1.5 block"
            >
              Custom Order Lead Time{" "}
              <span className="text-ui-fg-muted font-normal">(hours)</span>
            </Label>
            <Text size="small" className="text-ui-fg-subtle mb-3">
              Enter{" "}
              <span className="font-medium text-ui-fg-base">0</span> to use the
              platform default.  A positive value is added to every order's
              estimated delivery time when Kitchen Busy mode is active.
            </Text>
            <Input
              id="lead-time-input"
              type="number"
              min="0"
              step="0.5"
              value={leadTimeHours}
              onChange={handleLeadTimeChange}
              disabled={isLoadingSettings || acceptingOrders}
              placeholder="e.g. 2"
              className={!acceptingOrders ? "border-ui-border-interactive" : ""}
            />
            {!acceptingOrders && (
              <Text size="xsmall" className="text-ui-fg-muted mt-1.5">
                Lead time is active because Kitchen Busy mode is on.
              </Text>
            )}
          </div>
        </div>

        {/* ── Footer / Actions ── */}
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            {settings?.updated_at && (
              <Text size="xsmall" className="text-ui-fg-muted">
                Last saved:{" "}
                {new Date(settings.updated_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </Text>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Discard changes */}
            <Button
              type="button"
              variant="secondary"
              size="small"
              disabled={!isDirty || isSaving}
              onClick={() => {
                if (!settings) return
                setAcceptingOrders(settings.accepting_immediate_orders)
                setLeadTimeHours(String(settings.custom_lead_time_hours ?? 0))
                setIsDirty(false)
              }}
            >
              Discard
            </Button>

            {/* Save */}
            <Button
              type="submit"
              variant="primary"
              size="small"
              isLoading={isSaving}
              disabled={!isDirty || isSaving}
            >
              Save Settings
            </Button>
          </div>
        </div>
      </form>
    </Container>
  )
}

export default SettingsPanel
