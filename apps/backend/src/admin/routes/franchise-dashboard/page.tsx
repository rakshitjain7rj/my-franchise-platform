/**
 * Franchise Dashboard page — wires the FranchiseProvider, FranchiseSwitcher,
 * and the instrumented useFranchiseFetch into the existing dashboard UI.
 *
 * Integration notes
 * -----------------
 * 1.  The `FranchiseProvider` wraps only this route's subtree.  If you later
 *     need the context available globally (e.g. in widgets on other pages),
 *     move the provider into a Medusa admin UI layout file instead.
 *
 * 2.  The first render fetches with whatever franchise ID was restored from
 *     localStorage (or the first allowed ID).  When the response arrives we
 *     call `setAllowedFranchiseIds` so the switcher can show all options with
 *     their real names.
 *
 * 3.  `useQuery` re-runs automatically when `activeFranchiseId` changes
 *     because it is part of the `queryKey`.
 *
 * 4.  `refetchInterval: 30_000` drives silent background polling every 30 s.
 *     This keeps order queues and perishable inventory counts live for bakery
 *     kitchen teams without manual page refreshes.
 */

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChartBar } from "@medusajs/icons"
import {
  Badge,
  Container,
  DataTable,
  Heading,
  Text,
  createDataTableColumnHelper,
  useDataTable,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState, useRef } from "react"
import type { DataTablePaginationState } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { FranchiseProvider, useFranchise } from "../../providers/FranchiseContext"
import { FranchiseSwitcher } from "../../components/FranchiseSwitcher"
import { useFranchiseFetch, sdk } from "../../lib/sdk"
import { SettingsPanel } from "../../components/SettingsPanel"
import { FranchiseLocationsManager } from "../../components/FranchiseLocationsManager"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DashboardProduct = {
  id: string
  title?: string
  status?: string
}

type DashboardStore = {
  id: string
  name?: string
}

type DashboardResponse = {
  /** Provided by the backend RBAC layer. */
  allowed_franchise_ids: string[]
  franchise: {
    id: string
    name: string
    code: string
    is_active: boolean
  } | null
  overview: {
    product_count: number
    store_count: number
    is_active: boolean
  }
  /** Live inventory metrics from the Inventory Module. */
  inventory: {
    total_stocked_quantity: number
    total_reserved_quantity: number
    total_incoming_quantity: number
    items: Array<{
      inventory_item_id: string
      location_id: string
      stocked_quantity: number
      reserved_quantity: number
      incoming_quantity: number
    }>
  }
  products: DashboardProduct[]
  pagination: {
    count: number
    limit: number
    offset: number
  }
  stores: DashboardStore[]
  alerts: Array<{
    severity: "info" | "warning"
    message: string
  }>
}

// ---------------------------------------------------------------------------
// Table column definitions
// ---------------------------------------------------------------------------

const productColumnHelper = createDataTableColumnHelper<DashboardProduct>()

const productColumns = [
  productColumnHelper.accessor("id", {
    header: "ID",
  }),
  productColumnHelper.accessor("title", {
    header: "Name",
    cell: ({ getValue }) => getValue() || "-",
  }),
  productColumnHelper.accessor("status", {
    header: "State",
    cell: ({ getValue }) => getValue() || "draft",
  }),
]

// ---------------------------------------------------------------------------
// Inner dashboard (has access to FranchiseContext)
// ---------------------------------------------------------------------------

const FranchiseDashboardInner = () => {
  const { t } = useTranslation()
  const { activeFranchiseId, setAllowedFranchiseIds, setActiveFranchiseId } = useFranchise()
  const franchiseFetch = useFranchiseFetch()

  const { data: meData } = useQuery({
    queryKey: ["super-admin-me-check"],
    queryFn: () =>
      sdk.client.fetch("/admin/users/me") as Promise<{ user: any }>,
  })

  useEffect(() => {
    if (meData && meData.user?.metadata?.is_super_admin !== true) {
      const styleId = "hide-super-admin-portal-style"
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style")
        style.id = styleId
        style.innerHTML = `
          a[href="/admin/super-admin"],
          a[href*="/super-admin"] {
            display: none !important;
          }
        `
        document.head.appendChild(style)
      }
    }
  }, [meData])

  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageSize: 10,
    pageIndex: 0,
  })

  const offset = useMemo(
    () => pagination.pageIndex * pagination.pageSize,
    [pagination]
  )

  // Re-fetch whenever the active franchise or pagination changes.
  // `refetchInterval: 30_000` enables silent background polling every 30 s
  // so order queues and perishable stock levels stay current for kitchen teams.
  //
  // IMPORTANT: The query fires even when `activeFranchiseId` is null.
  // On first load the context has no franchise ID yet (chicken-and-egg).
  // The backend's `resolveAdminFranchiseContext` handles this gracefully —
  // when no `x-franchise-id` header is present it resolves the user's
  // franchise from the franchise-user link table and falls back to the
  // first allowed ID.  The response seeds our context (see useEffect below).
  // Client-only timestamp to avoid SSR/hydration mismatch from toLocaleTimeString()
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>("")
  const isMounted = useRef(false)

  const { data, isLoading, dataUpdatedAt } = useQuery<DashboardResponse>({
    queryKey: ["franchise-dashboard", activeFranchiseId, pagination.pageSize, offset],
    queryFn: () =>
      franchiseFetch("/admin/franchise-dashboard", {
        query: {
          limit: pagination.pageSize,
          offset,
        },
      }) as Promise<DashboardResponse>,
    // Always enabled — the backend resolves franchise from auth context when
    // no header is sent, breaking the bootstrap deadlock.
    enabled: true,
    refetchInterval: 30_000,          // Poll every 30 seconds
    refetchIntervalInBackground: true, // Continue polling even when tab is not focused
    staleTime: 20_000,                // Consider data fresh for 20 s to avoid flicker
  })

  // Seed the context with the full allowed list and active franchise ID
  // returned by the API.  This closes the bootstrap loop: the first response
  // tells us which franchise the backend resolved, so all subsequent requests
  // will carry the correct `x-franchise-id` header via `useFranchiseFetch`.
  // Update the displayed timestamp only on the client, never during SSR
  useEffect(() => {
    isMounted.current = true
  }, [])

  useEffect(() => {
    if (!isMounted.current) return
    if (dataUpdatedAt > 0) {
      setLastUpdatedLabel(new Date(dataUpdatedAt).toLocaleTimeString())
    }
  }, [dataUpdatedAt])

  useEffect(() => {
    if (data?.allowed_franchise_ids?.length) {
      setAllowedFranchiseIds(data.allowed_franchise_ids)
    }
    // If we didn't have an active franchise yet (first load), adopt the one
    // the backend resolved for us.  This ensures all future requests
    // (polling, pagination, settings) carry the header.
    if (!activeFranchiseId && data?.franchise?.id && data?.allowed_franchise_ids?.length) {
      // Temporarily set the allowed list first so setActiveFranchiseId
      // doesn't throw an "ID not in allowed list" error.
      setAllowedFranchiseIds(data.allowed_franchise_ids)
      try {
        setActiveFranchiseId(data.franchise.id)
      } catch {
        // Silently ignore if the ID isn't in the allowed set (edge case)
      }
    }
  }, [data?.allowed_franchise_ids, data?.franchise?.id, activeFranchiseId, setAllowedFranchiseIds, setActiveFranchiseId])

  // Build a label map: franchise_id → franchise name (if known).
  const franchiseLabels = useMemo<Record<string, string>>(() => {
    if (!data?.franchise) return {}
    return { [data.franchise.id]: `${data.franchise.name} (${data.franchise.code})` }
  }, [data?.franchise])

  const productTable = useDataTable({
    columns: productColumns,
    data: data?.products || [],
    getRowId: (row) => row.id,
    rowCount: data?.pagination.count || 0,
    isLoading,
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
  })

  return (
    <Container className="divide-y p-0">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Heading level="h1">{t("franchiseDashboard.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            {t("franchiseDashboard.subtitle")}
          </Text>
          <Text size="small" className="text-ui-fg-subtle mt-2">
            {data?.franchise
              ? `${data.franchise.name} (${data.franchise.code})`
              : activeFranchiseId ?? "-"}
          </Text>
        </div>

        {/* The switcher renders nothing for single-franchise users. */}
        <FranchiseSwitcher franchiseLabels={franchiseLabels} />
      </div>

      {/* ── KPI cards (overview) ── */}
      <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
        <Container className="p-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("franchiseDashboard.metrics.products")}
          </Text>
          <Heading level="h2" className="mt-2">
            {data?.overview.product_count ?? 0}
          </Heading>
        </Container>

        <Container className="p-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("franchiseDashboard.metrics.stores")}
          </Text>
          <Heading level="h2" className="mt-2">
            {data?.overview.store_count ?? 0}
          </Heading>
        </Container>

        <Container className="p-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("franchiseDashboard.metrics.status")}
          </Text>
          <div className="mt-2">
            <Badge color={data?.overview.is_active ? "green" : "red"}>
              {data?.overview.is_active
                ? t("franchiseDashboard.status.active")
                : t("franchiseDashboard.status.inactive")}
            </Badge>
          </div>
        </Container>
      </div>

      {/* ── Live Inventory KPIs ── */}
      <div className="px-6 pb-2">
        <div className="flex items-center justify-between mb-3">
          <Heading level="h2">Live Inventory</Heading>
          {lastUpdatedLabel && (
            <Text size="xsmall" className="text-ui-fg-muted">
              Last updated: {lastUpdatedLabel} · auto-refreshes every 30 s
            </Text>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Stocked */}
          <Container className="p-4">
            <Text size="small" className="text-ui-fg-subtle">Total Stocked</Text>
            <Heading level="h2" className="mt-2">
              {data?.inventory.total_stocked_quantity ?? 0}
            </Heading>
            <Text size="xsmall" className="text-ui-fg-muted mt-1">
              units across all locations
            </Text>
          </Container>

          {/* Reserved */}
          <Container className="p-4">
            <Text size="small" className="text-ui-fg-subtle">Reserved</Text>
            <Heading level="h2" className="mt-2">
              {data?.inventory.total_reserved_quantity ?? 0}
            </Heading>
            <Text size="xsmall" className="text-ui-fg-muted mt-1">
              pending fulfilment
            </Text>
          </Container>

          {/* Incoming */}
          <Container className="p-4">
            <Text size="small" className="text-ui-fg-subtle">Incoming</Text>
            <Heading level="h2" className="mt-2">
              {data?.inventory.total_incoming_quantity ?? 0}
            </Heading>
            <Text size="xsmall" className="text-ui-fg-muted mt-1">
              expected replenishment
            </Text>
          </Container>
        </div>

        {/* Per-item low-stock warnings (stocked < reserved + 2) */}
        {(data?.inventory.items ?? []).filter(
          (item) => item.stocked_quantity - item.reserved_quantity < 2
        ).length > 0 && (
          <div className="mt-3 rounded-md border border-ui-border-strong bg-ui-bg-subtle p-3">
            <Text size="small" weight="plus" className="text-ui-fg-base mb-2">
              ⚠ Low-Stock Items
            </Text>
            <div className="space-y-1">
              {data!.inventory.items
                .filter((item) => item.stocked_quantity - item.reserved_quantity < 2)
                .map((item) => (
                  <div
                    key={`${item.inventory_item_id}-${item.location_id}`}
                    className="flex items-center justify-between"
                  >
                    <Text size="xsmall" className="text-ui-fg-subtle font-mono">
                      {item.inventory_item_id.slice(0, 24)}…
                    </Text>
                    <Badge color="orange">
                      {item.stocked_quantity} stocked / {item.reserved_quantity} reserved
                    </Badge>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Products table ── */}
      <div className="p-6">
        <DataTable instance={productTable}>
          <DataTable.Toolbar className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
            <Heading>{t("franchiseDashboard.products.title")}</Heading>
          </DataTable.Toolbar>
          <DataTable.Table />
          <DataTable.Pagination />
        </DataTable>
      </div>

      {/* ── Stores & alerts ── */}
      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <FranchiseLocationsManager />

        <Container className="p-4">
          <Heading level="h2" className="mb-4">
            {t("franchiseDashboard.alerts.title")}
          </Heading>
          <div className="space-y-3">
            {data?.alerts?.map((alert, index) => (
              <div
                key={`${alert.message}-${index}`}
                className="border-ui-border-base rounded-md border p-3"
              >
                <Badge color={alert.severity === "warning" ? "orange" : "blue"}>
                  {alert.severity}
                </Badge>
                <Text className="mt-2">{alert.message}</Text>
              </div>
            ))}
          </div>
        </Container>
      </div>

      {/* ── Local Franchise Settings ── */}
      {data?.franchise?.id && (
        <div className="p-6">
          <SettingsPanel franchiseId={data.franchise.id} />
        </div>
      )}
    </Container>
  )
}

// ---------------------------------------------------------------------------
// Exported page – wraps inner component with the provider
// ---------------------------------------------------------------------------

const FranchiseDashboardPage = () => (
  <FranchiseProvider>
    <FranchiseDashboardInner />
  </FranchiseProvider>
)

export const config = defineRouteConfig({
  label: "Franchise Dashboard",
  icon: ChartBar,
  rank: 1,
})

export default FranchiseDashboardPage
