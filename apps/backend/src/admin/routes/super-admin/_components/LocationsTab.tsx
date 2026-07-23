import { useMemo, useState } from "react"
import { Badge, Button, Switch, Table, Tooltip } from "@medusajs/ui"
import { BuildingStorefront } from "@medusajs/icons"
import type { StoreLocation } from "./types"
import {
  EmptyState,
  SearchInput,
  SectionHeading,
  TableBodySkeleton,
} from "../../../components/ui"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LocationsTabProps {
  locations: StoreLocation[]
  isLoading: boolean
  onAddLocation: () => void
  onEditLocation: (loc: StoreLocation) => void
  /**
   * Called when the user clicks Delete. The parent is responsible for
   * showing the confirmation dialog before running the mutation.
   */
  onDeleteLocation: (loc: StoreLocation) => void
  /**
   * Called when either toggle switch is flipped in a table row.
   * The parent performs an optimistic cache update + targeted PATCH.
   *
   * @param id    - StoreLocation ID
   * @param field - the field being toggled
   * @param value - new boolean value
   */
  onToggleLocation: (
    id: string,
    field: "is_active" | "is_accepting_orders" | "is_default",
    value: boolean
  ) => void
}

// ---------------------------------------------------------------------------
// LocationsTab
// ---------------------------------------------------------------------------

export const LocationsTab = ({
  locations,
  isLoading,
  onAddLocation,
  onEditLocation,
  onDeleteLocation,
  onToggleLocation,
}: LocationsTabProps) => {
  const [search, setSearch] = useState("")

  const visibleLocations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return locations
    return locations.filter((loc) =>
      `${loc.name} ${loc.code} ${loc.franchise?.name ?? ""} ${loc.address ?? ""}`
        .toLowerCase()
        .includes(q)
    )
  }, [locations, search])

  const columnCount = 10

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SectionHeading title="Bakery & Store Locations" />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, code, franchise…"
            ariaLabel="Search locations"
            className="w-full sm:w-64"
          />
          <Button size="small" onClick={onAddLocation}>
            Add Location
          </Button>
        </div>
      </div>

      {!isLoading && locations.length === 0 ? (
        <EmptyState
          icon={<BuildingStorefront />}
          title="No store locations yet"
          description="Add your first bakery location so the storefront can route orders and track branch inventory."
          primaryAction={{ label: "Add Location", onClick: onAddLocation }}
        />
      ) : !isLoading && visibleLocations.length === 0 ? (
        <EmptyState
          icon={<BuildingStorefront />}
          title="No locations match your search"
          description={`Nothing found for “${search.trim()}”. Try a different name, code or franchise.`}
          secondaryAction={{ label: "Clear search", onClick: () => setSearch("") }}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Code</Table.HeaderCell>
                <Table.HeaderCell>Location Name</Table.HeaderCell>
                <Table.HeaderCell>Franchise</Table.HeaderCell>
                <Table.HeaderCell>Address</Table.HeaderCell>
                <Table.HeaderCell>Lead Time</Table.HeaderCell>
                <Table.HeaderCell>Capacity</Table.HeaderCell>
                {/* Two inline toggles replace the old static LocationStatus dot */}
                <Table.HeaderCell>Visible</Table.HeaderCell>
                <Table.HeaderCell>Orders</Table.HeaderCell>
                <Table.HeaderCell>Default</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            {isLoading ? (
              <TableBodySkeleton rows={4} columns={columnCount} />
            ) : (
              <Table.Body>
                {visibleLocations.map((loc) => (
                  <Table.Row key={loc.id}>
                    <Table.Cell className="font-mono text-xs font-semibold whitespace-nowrap">
                      {loc.code}
                    </Table.Cell>
                    <Table.Cell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap">{loc.name}</span>
                        {loc.is_default && (
                          <Badge color="green" size="2xsmall">
                            Default
                          </Badge>
                        )}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color="grey" size="2xsmall">
                        {loc.franchise?.name || "Unlinked"}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-subtle max-w-[16rem] truncate">
                      {loc.address || "—"}
                    </Table.Cell>
                    <Table.Cell className="text-xs whitespace-nowrap">
                      {loc.custom_lead_time_hours} hrs
                    </Table.Cell>
                    <Table.Cell className="text-xs whitespace-nowrap">
                      {loc.daily_order_capacity} / slot
                    </Table.Cell>
                    <Table.Cell>
                      {/*
                        is_active: controls storefront visibility and routing.
                        Optimistic update happens in the parent via onToggleLocation.
                      */}
                      <Switch
                        checked={loc.is_active}
                        onCheckedChange={(value) =>
                          onToggleLocation(loc.id, "is_active", value)
                        }
                        aria-label={`Toggle ${loc.name} visibility`}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      {/*
                        is_accepting_orders: temporarily pauses order intake
                        (e.g. during kitchen rush) without deactivating the location.
                        Disabled — with a tooltip — when the location is inactive.
                      */}
                      <Tooltip
                        content={
                          !loc.is_active
                            ? "Cannot accept orders when location is inactive"
                            : "Pause or resume order intake"
                        }
                      >
                        <span className="inline-flex">
                          <Switch
                            checked={loc.is_accepting_orders}
                            disabled={!loc.is_active}
                            onCheckedChange={(value) =>
                              onToggleLocation(loc.id, "is_accepting_orders", value)
                            }
                            aria-label={`Toggle ${loc.name} accepting orders`}
                          />
                        </span>
                      </Tooltip>
                    </Table.Cell>
                    <Table.Cell>
                      {/*
                        is_default: pre-selects this bakery for storefront visitors
                        who have not chosen a store yet. Only one default per franchise.
                      */}
                      <Tooltip
                        content={
                          !loc.is_active
                            ? "Activate the location before setting it as default"
                            : loc.is_default
                              ? "This is the default store for new visitors"
                              : "Set as default store for new visitors"
                        }
                      >
                        <span className="inline-flex">
                          <Switch
                            checked={Boolean(loc.is_default)}
                            disabled={!loc.is_active && !loc.is_default}
                            onCheckedChange={(value) =>
                              onToggleLocation(loc.id, "is_default", value)
                            }
                            aria-label={`Set ${loc.name} as default store`}
                          />
                        </span>
                      </Tooltip>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => onEditLocation(loc)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          variant="danger"
                          onClick={() => onDeleteLocation(loc)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            )}
          </Table>
        </div>
      )}
    </>
  )
}
