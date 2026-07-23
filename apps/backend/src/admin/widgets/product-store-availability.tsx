/**
 * product-store-availability.tsx — Phase 4 merged widget
 *
 * Replaces the old widget that only showed on/off menu toggles.
 * Now shows one row per branch with BOTH:
 *   • On-menu toggle  (store_location_product override)
 *   • Stock quantity  (editable stocked_quantity at that branch)
 *
 * Backed by GET/POST /admin/products/:id/store-stock (unified endpoint).
 *
 * "Shared across all stores" mode is preserved: when no branch is toggled on,
 * the product is available everywhere and the quantity column shows the total
 * stocked at each location for reference (not editable in shared mode).
 */

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { CircleWarningSolid } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Skeleton,
  Switch,
  Text,
  Tooltip,
  toast,
} from "@medusajs/ui"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useEffect, useCallback } from "react"
import { sdk } from "../lib/sdk"
import { EmptyState } from "../components/ui"

// ── Types ─────────────────────────────────────────────────────────────────────

type BranchRow = {
  store_location_id: string
  store_location_name: string
  store_location_code: string
  is_active: boolean
  is_accepting_orders: boolean
  on_menu: boolean
  stock_location_id: string | null
  quantity: number | null
  needs_wiring: boolean
}

type StoreStockResponse = {
  product_id: string
  shared_across_all_stores: boolean
  branches: BranchRow[]
}

type LocalBranch = BranchRow & {
  local_on_menu: boolean
  local_quantity: string
  dirty: boolean
}

// ── Widget ────────────────────────────────────────────────────────────────────

const ProductStoreAvailabilityWidget = ({ data }: { data: { id: string } }) => {
  const productId = data.id
  const queryClient = useQueryClient()

  // Local editable state keyed by store_location_id
  const [localBranches, setLocalBranches] = useState<Map<string, LocalBranch>>(
    new Map()
  )
  const [isDirty, setIsDirty] = useState(false)

  // ── Fetch ────────────────────────────────────────────────────────────────

  const { data: storeStock, isLoading } = useQuery({
    queryKey: ["product-store-stock", productId],
    queryFn: () =>
      sdk.client.fetch(
        `/admin/products/${productId}/store-stock`
      ) as Promise<StoreStockResponse>,
    enabled: Boolean(productId),
  })

  // Sync server state into local editable state on load (not when dirty)
  useEffect(() => {
    if (!storeStock || isDirty) return
    const map = new Map<string, LocalBranch>()
    for (const branch of storeStock.branches) {
      map.set(branch.store_location_id, {
        ...branch,
        local_on_menu: branch.on_menu,
        local_quantity: branch.quantity != null ? String(branch.quantity) : "0",
        dirty: false,
      })
    }
    setLocalBranches(map)
  }, [storeStock, isDirty])

  // ── Derived state ────────────────────────────────────────────────────────

  const branches = Array.from(localBranches.values())
  const anyOnMenu = branches.some((b) => b.local_on_menu)
  const isShared = !anyOnMenu

  // ── Handlers ─────────────────────────────────────────────────────────────

  const updateBranch = useCallback(
    (storeLocationId: string, patch: Partial<LocalBranch>) => {
      setLocalBranches((prev) => {
        const next = new Map(prev)
        const existing = next.get(storeLocationId)
        if (!existing) return prev
        next.set(storeLocationId, { ...existing, ...patch, dirty: true })
        return next
      })
      setIsDirty(true)
    },
    []
  )

  const handleToggleOnMenu = (storeLocationId: string, checked: boolean) => {
    updateBranch(storeLocationId, { local_on_menu: checked })
  }

  const handleQuantityChange = (storeLocationId: string, value: string) => {
    updateBranch(storeLocationId, { local_quantity: value })
  }

  const handleClearAll = () => {
    setLocalBranches((prev) => {
      const next = new Map(prev)
      for (const [id, branch] of next) {
        next.set(id, { ...branch, local_on_menu: false, dirty: true })
      }
      return next
    })
    setIsDirty(true)
  }

  /** Discard local edits and re-seed from the last server response. */
  const handleDiscard = () => {
    if (!storeStock) return
    const map = new Map<string, LocalBranch>()
    for (const branch of storeStock.branches) {
      map.set(branch.store_location_id, {
        ...branch,
        local_on_menu: branch.on_menu,
        local_quantity: branch.quantity != null ? String(branch.quantity) : "0",
        dirty: false,
      })
    }
    setLocalBranches(map)
    setIsDirty(false)
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: () => {
      const branchUpdates = branches.map((b) => ({
        store_location_id: b.store_location_id,
        on_menu: b.local_on_menu,
        quantity: b.local_quantity !== "" ? Number(b.local_quantity) : null,
      }))
      return sdk.client.fetch(`/admin/products/${productId}/store-stock`, {
        method: "POST",
        body: { branches: branchUpdates },
      })
    },
    onSuccess: () => {
      setIsDirty(false)
      queryClient.invalidateQueries({ queryKey: ["product-store-stock", productId] })
      toast.success("Store availability updated", {
        description: isShared
          ? "Product is shared across all stores."
          : `Product is restricted to ${branches.filter((b) => b.local_on_menu).length} store(s).`,
      })
    },
    onError: (err: any) => {
      toast.error("Failed to update", {
        description: err.message || "Could not save store availability.",
      })
    },
  })

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Container className="p-4" aria-busy="true" aria-label="Loading store availability">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-6 w-10 rounded-full" />
              <Skeleton className="h-7 w-24 rounded-md" />
            </div>
          ))}
        </div>
      </Container>
    )
  }

  if (!branches.length) {
    return (
      <Container className="p-4">
        <Heading level="h2" className="mb-3">
          Store Availability & Stock
        </Heading>
        <EmptyState
          framed={false}
          title="No store locations"
          description="Add locations in the Franchise Dashboard or Super Admin Portal first so you can control menu and stock per branch."
          className="py-6"
        />
      </Container>
    )
  }

  const wiringIssueCount = branches.filter((b) => b.needs_wiring).length

  return (
    <Container className="p-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-1">
        <Heading level="h2">Store Availability & Stock</Heading>
        {isShared ? (
          <Badge color="green" size="xsmall">All Stores</Badge>
        ) : (
          <Badge color="orange" size="xsmall">
            {branches.filter((b) => b.local_on_menu).length} Store
            {branches.filter((b) => b.local_on_menu).length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <Text className="text-ui-fg-subtle text-sm mb-4">
        Toggle <strong>On Menu</strong> to restrict this product to specific
        branches. Edit <strong>Qty</strong> to set the stock level at each
        location.
      </Text>

      {/* ── Wiring warning ── */}
      {wiringIssueCount > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 mb-3 rounded-md bg-ui-bg-subtle border border-ui-border-base"
        >
          <CircleWarningSolid className="text-ui-tag-orange-icon shrink-0 mt-0.5" />
          <Text size="xsmall" className="text-ui-fg-subtle">
            {wiringIssueCount} branch
            {wiringIssueCount !== 1 ? "es are" : " is"} missing a stock
            location. Use the Store Health panel to fix wiring.
          </Text>
        </div>
      )}

      {/* ── Shared mode info + clear button ── */}
      {isShared && (
        <div className="flex items-center justify-between py-2 border-b border-ui-border-base mb-3">
          <Text size="xsmall" className="text-ui-fg-subtle italic">
            Product is shared across all stores (no branch restrictions active).
            Toggle a branch below to restrict.
          </Text>
        </div>
      )}

      {!isShared && (
        <div className="flex justify-end mb-2">
          <Button size="small" variant="transparent" onClick={handleClearAll}>
            Clear all restrictions
          </Button>
        </div>
      )}

      {/* ── Branch table ── */}
      <div className="space-y-0">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 pb-1 border-b border-ui-border-base text-xs text-ui-fg-muted font-medium uppercase tracking-wide">
          <span>Branch</span>
          <span className="w-16 text-center">On Menu</span>
          <span className="w-24 text-right">Qty</span>
        </div>

        {branches.map((branch) => (
          <div
            key={branch.store_location_id}
            className={`grid grid-cols-[1fr_auto_auto] gap-3 items-center py-2 border-b border-ui-border-base last:border-b-0 ${
              branch.needs_wiring ? "opacity-60" : ""
            }`}
          >
            {/* Branch info */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Text size="small" weight="plus" className="truncate">
                  {branch.store_location_name}
                </Text>
                <Text size="xsmall" className="text-ui-fg-muted font-mono shrink-0">
                  {branch.store_location_code}
                </Text>
                {!branch.is_active && (
                  <Badge color="red" size="xsmall">Inactive</Badge>
                )}
                {!branch.is_accepting_orders && (
                  <Badge color="orange" size="xsmall">Closed</Badge>
                )}
                {branch.needs_wiring && (
                  <Tooltip content="No stock location linked to this branch">
                    <Badge color="red" size="xsmall">No stock location</Badge>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* On-menu toggle */}
            <div className="w-16 flex justify-center">
              <Switch
                checked={branch.local_on_menu}
                onCheckedChange={(checked) =>
                  handleToggleOnMenu(branch.store_location_id, checked)
                }
                disabled={branch.needs_wiring}
              />
            </div>

            {/* Stock quantity */}
            <div className="w-24">
              {branch.needs_wiring ? (
                <Text size="xsmall" className="text-ui-fg-muted text-right">
                  —
                </Text>
              ) : (
                <Input
                  type="number"
                  min={0}
                  value={branch.local_quantity}
                  onChange={(e) =>
                    handleQuantityChange(branch.store_location_id, e.target.value)
                  }
                  className="text-right h-7 text-sm"
                  placeholder="0"
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Save ── */}
      {isDirty && (
        <div className="flex justify-end gap-2 pt-3 mt-3 border-t border-ui-border-base">
          <Button
            size="small"
            variant="secondary"
            onClick={handleDiscard}
            disabled={saveMutation.isPending}
          >
            Discard
          </Button>
          <Button
            size="small"
            onClick={() => saveMutation.mutate()}
            isLoading={saveMutation.isPending}
          >
            Save Changes
          </Button>
        </div>
      )}
    </Container>
  )
}

// ── Config ────────────────────────────────────────────────────────────────────

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductStoreAvailabilityWidget
