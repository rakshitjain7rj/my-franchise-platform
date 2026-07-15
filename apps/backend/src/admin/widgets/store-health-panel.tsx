/**
 * store-health-panel.tsx
 *
 * Phase 4 — Store Health Panel widget.
 *
 * Injected into the franchise dashboard page. Shows a per-branch health
 * status table with one-click repair buttons, replacing the manual repair
 * scripts (fix-live-franchise-gaps.ts, link-stores-direct.ts, etc.).
 *
 * Endpoint: GET  /admin/franchise-dashboard/store-health
 *           POST /admin/franchise-dashboard/store-health/fix/:store_location_id
 */

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Text,
  Tooltip,
  toast,
} from "@medusajs/ui"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../lib/sdk"

// ── Types ─────────────────────────────────────────────────────────────────────

type BranchHealth = {
  store_location_id: string
  store_location_name: string
  store_location_code: string
  is_accepting_orders: boolean
  has_stock_location: boolean
  stock_location_id: string | null
  has_sales_channel: boolean
  inventory_item_count: number
  issues: string[]
  healthy: boolean
}

type StoreHealthResponse = {
  franchise_id: string
  total_branches: number
  healthy_branches: number
  unhealthy_branches: number
  branches: BranchHealth[]
}

// ── Check icon helpers ────────────────────────────────────────────────────────

const Check = () => (
  <span className="text-ui-fg-interactive text-xs font-bold">✓</span>
)
const Warn = () => (
  <span className="text-ui-fg-error text-xs font-bold">✗</span>
)
const Neutral = () => (
  <span className="text-ui-fg-muted text-xs">—</span>
)

// ── Widget ────────────────────────────────────────────────────────────────────

const StoreHealthPanel = () => {
  const queryClient = useQueryClient()

  const { data: health, isLoading } = useQuery({
    queryKey: ["franchise-store-health"],
    queryFn: () =>
      sdk.client.fetch(
        "/admin/franchise-dashboard/store-health"
      ) as Promise<StoreHealthResponse>,
    refetchInterval: 30_000, // auto-refresh every 30s
  })

  const fixMutation = useMutation({
    mutationFn: (storeLocationId: string) =>
      sdk.client.fetch(
        `/admin/franchise-dashboard/store-health/fix/${storeLocationId}`,
        { method: "POST" }
      ) as Promise<{ fixed: boolean; fixes: string[]; errors: string[] }>,
    onSuccess: (result, storeLocationId) => {
      queryClient.invalidateQueries({ queryKey: ["franchise-store-health"] })
      if (result.fixed) {
        toast.success("Branch repaired", {
          description: result.fixes.join(" · "),
        })
      } else {
        toast.error("Partial repair", {
          description:
            [...result.fixes, ...result.errors.map((e) => `⚠ ${e}`)].join(
              " · "
            ),
        })
      }
    },
    onError: (err: any) => {
      toast.error("Repair failed", { description: err.message })
    },
  })

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Container className="p-4">
        <Text className="text-ui-fg-subtle animate-pulse">
          Loading store health…
        </Text>
      </Container>
    )
  }

  if (!health || !health.branches.length) {
    return (
      <Container className="p-4">
        <Heading level="h2" className="mb-2">
          Store Health
        </Heading>
        <Text className="text-ui-fg-muted text-sm">
          No store locations configured yet.
        </Text>
      </Container>
    )
  }

  const allHealthy = health.unhealthy_branches === 0

  return (
    <Container className="p-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <Heading level="h2">Store Health</Heading>
        <div className="flex items-center gap-2">
          {allHealthy ? (
            <Badge color="green" size="xsmall">
              All {health.total_branches} Healthy
            </Badge>
          ) : (
            <>
              <Badge color="green" size="xsmall">
                {health.healthy_branches} OK
              </Badge>
              <Badge color="red" size="xsmall">
                {health.unhealthy_branches} Issue
                {health.unhealthy_branches !== 1 ? "s" : ""}
              </Badge>
            </>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div>
        {/* Header row */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 pb-1 border-b border-ui-border-base text-xs text-ui-fg-muted font-medium uppercase tracking-wide">
          <span>Branch</span>
          <span className="w-16 text-center">Stock Loc</span>
          <span className="w-16 text-center">Sales Ch.</span>
          <span className="w-10 text-center">Items</span>
          <span className="w-16 text-center">Action</span>
        </div>

        {health.branches.map((branch) => (
          <div
            key={branch.store_location_id}
            className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center py-2 border-b border-ui-border-base last:border-b-0 ${
              branch.healthy ? "" : "bg-ui-bg-base"
            }`}
          >
            {/* Branch info */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Text size="small" weight={branch.healthy ? "regular" : "plus"} className="truncate">
                  {branch.store_location_name}
                </Text>
                <Text size="xsmall" className="text-ui-fg-muted font-mono shrink-0">
                  {branch.store_location_code}
                </Text>
                {!branch.is_accepting_orders && (
                  <Badge color="orange" size="xsmall">Closed</Badge>
                )}
              </div>
              {!branch.healthy && branch.issues.length > 0 && (
                <div className="mt-0.5 space-y-0.5">
                  {branch.issues.map((issue, i) => (
                    <Text key={i} size="xsmall" className="text-ui-fg-error leading-tight">
                      {issue}
                    </Text>
                  ))}
                </div>
              )}
            </div>

            {/* Stock location check */}
            <div className="w-16 flex justify-center">
              {branch.has_stock_location ? <Check /> : <Warn />}
            </div>

            {/* Sales channel check */}
            <div className="w-16 flex justify-center">
              {!branch.has_stock_location ? (
                <Neutral />
              ) : branch.has_sales_channel ? (
                <Check />
              ) : (
                <Warn />
              )}
            </div>

            {/* Inventory item count */}
            <div className="w-10 flex justify-center">
              <Text size="xsmall" className={
                branch.inventory_item_count === 0 && branch.has_stock_location
                  ? "text-ui-fg-error"
                  : "text-ui-fg-subtle"
              }>
                {branch.has_stock_location ? branch.inventory_item_count : "—"}
              </Text>
            </div>

            {/* Fix button */}
            <div className="w-16 flex justify-center">
              {branch.healthy ? (
                <Text size="xsmall" className="text-ui-fg-muted">OK</Text>
              ) : !branch.has_stock_location ? (
                <Tooltip content="Stock location missing — recreate this branch to provision one">
                  <Text size="xsmall" className="text-ui-fg-muted cursor-help">N/A</Text>
                </Tooltip>
              ) : (
                <Button
                  size="xsmall"
                  variant="secondary"
                  isLoading={
                    fixMutation.isPending &&
                    fixMutation.variables === branch.store_location_id
                  }
                  onClick={() => fixMutation.mutate(branch.store_location_id)}
                >
                  Fix
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Text size="xsmall" className="text-ui-fg-muted mt-3">
        Auto-refreshes every 30s. Click <strong>Fix</strong> to wire missing
        sales-channel associations and create missing inventory levels.
      </Text>
    </Container>
  )
}

// ── Config — inject into the franchise dashboard sidebar ──────────────────────

export const config = defineWidgetConfig({
  zone: "product.details.before",
})

export default StoreHealthPanel
