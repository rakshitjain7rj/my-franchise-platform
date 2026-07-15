import React from "react"
import { Badge, Button, Heading, Switch, Table, Text } from "@medusajs/ui"
import type { Franchise } from "./types"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FranchisesTabProps {
  franchises: Franchise[]
  isLoading: boolean
  onAddFranchise: () => void
  onEditFranchise: (fran: Franchise) => void
  /**
   * Called immediately when the user flips the is_active switch.
   * The parent performs an optimistic cache update + PATCH mutation.
   */
  onToggleFranchiseActive: (id: string, value: boolean) => void
  onDeleteFranchise: (id: string) => void
}

// ---------------------------------------------------------------------------
// FranchisesTab
// ---------------------------------------------------------------------------

export const FranchisesTab = ({
  franchises,
  isLoading,
  onAddFranchise,
  onEditFranchise,
  onToggleFranchiseActive,
  onDeleteFranchise,
}: FranchisesTabProps) => {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Heading level="h2">Franchise Brands</Heading>
        <Button size="small" onClick={onAddFranchise}>
          Add Franchise
        </Button>
      </div>

      {isLoading ? (
        <Text className="text-ui-fg-subtle">Loading franchises...</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>ID</Table.HeaderCell>
              <Table.HeaderCell>Brand Name</Table.HeaderCell>
              <Table.HeaderCell>Code / Tenant Slug</Table.HeaderCell>
              <Table.HeaderCell>Locations</Table.HeaderCell>
              {/* Replaced static dot indicator with an actionable Switch */}
              <Table.HeaderCell>Active</Table.HeaderCell>
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {franchises.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={6} className="text-center py-4">
                  <Text className="text-ui-fg-muted">No franchises found.</Text>
                </Table.Cell>
              </Table.Row>
            ) : (
              franchises.map((fran) => (
                <Table.Row key={fran.id}>
                  <Table.Cell className="font-mono text-xs">{fran.id}</Table.Cell>
                  <Table.Cell className="font-medium">{fran.name}</Table.Cell>
                  <Table.Cell className="font-mono text-xs text-ui-fg-subtle">{fran.code}</Table.Cell>
                  <Table.Cell>
                    {fran.store_locations?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {fran.store_locations.map((loc) => (
                          <Badge key={loc.id} color="blue" size="xsmall">
                            {loc.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Text size="xsmall" className="text-ui-fg-muted">None</Text>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {/*
                      Quick-toggle: fires onToggleFranchiseActive which triggers an
                      optimistic cache update in the parent before the PATCH lands.
                    */}
                    <Switch
                      checked={fran.is_active}
                      onCheckedChange={(value) => onToggleFranchiseActive(fran.id, value)}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => onEditFranchise(fran)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="danger"
                        onClick={() => {
                          if (
                            confirm(
                              `Are you sure you want to delete the franchise "${fran.name}"? This will also cascade delete all store locations under this franchise.`
                            )
                          ) {
                            onDeleteFranchise(fran.id)
                          }
                        }}
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
