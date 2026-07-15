import React from "react"
import { Badge, Button, Heading, Switch, Table, Text } from "@medusajs/ui"
import type { StoreLocation } from "./types"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LocationsTabProps {
  locations: StoreLocation[]
  isLoading: boolean
  onAddLocation: () => void
  onEditLocation: (loc: StoreLocation) => void
  onDeleteLocation: (id: string, name: string) => void
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
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Heading level="h2">Bakery & Store Locations</Heading>
        <Button size="small" onClick={onAddLocation}>
          Add Location
        </Button>
      </div>

      {isLoading ? (
        <Text className="text-ui-fg-subtle">Loading store locations...</Text>
      ) : (
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
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {locations.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={10} className="text-center py-4">
                  <Text className="text-ui-fg-muted">No store locations found.</Text>
                </Table.Cell>
              </Table.Row>
            ) : (
              locations.map((loc) => (
                <Table.Row key={loc.id}>
                  <Table.Cell className="font-mono text-xs font-semibold">{loc.code}</Table.Cell>
                  <Table.Cell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{loc.name}</span>
                      {loc.is_default && (
                        <Badge color="green" size="xsmall">
                          Default
                        </Badge>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color="grey">{loc.franchise?.name || "Unlinked"}</Badge>
                  </Table.Cell>
                  <Table.Cell className="text-xs text-ui-fg-subtle max-w-xs truncate">
                    {loc.address || "-"}
                  </Table.Cell>
                  <Table.Cell className="text-xs">{loc.custom_lead_time_hours} hrs</Table.Cell>
                  <Table.Cell className="text-xs">{loc.daily_order_capacity} / slot</Table.Cell>
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
                    />
                  </Table.Cell>
                  <Table.Cell>
                    {/*
                      is_accepting_orders: temporarily pauses order intake
                      (e.g. during kitchen rush) without deactivating the location.
                      Disabled — with a tooltip — when the location is inactive.
                    */}
                    <div
                      title={
                        !loc.is_active
                          ? "Cannot accept orders when location is inactive"
                          : undefined
                      }
                      className="inline-flex"
                    >
                      <Switch
                        checked={loc.is_accepting_orders}
                        disabled={!loc.is_active}
                        onCheckedChange={(value) =>
                          onToggleLocation(loc.id, "is_accepting_orders", value)
                        }
                      />
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    {/*
                      is_default: pre-selects this bakery for storefront visitors
                      who have not chosen a store yet. Only one default per franchise.
                    */}
                    <div
                      title={
                        !loc.is_active
                          ? "Activate the location before setting it as default"
                          : loc.is_default
                            ? "This is the default store for new visitors"
                            : "Set as default store for new visitors"
                      }
                      className="inline-flex"
                    >
                      <Switch
                        checked={Boolean(loc.is_default)}
                        disabled={!loc.is_active && !loc.is_default}
                        onCheckedChange={(value) =>
                          onToggleLocation(loc.id, "is_default", value)
                        }
                      />
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-2">
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
                        onClick={() => onDeleteLocation(loc.id, loc.name)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      )}
    </>
  )
}
