import { useMemo, useState } from "react"
import { Badge, Button, Copy, Switch, Table, Text } from "@medusajs/ui"
import { Buildings } from "@medusajs/icons"
import type { Franchise } from "./types"
import {
  EmptyState,
  SearchInput,
  SectionHeading,
  TableBodySkeleton,
} from "../../../components/ui"

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
  /**
   * Called when the user clicks Delete. The parent is responsible for
   * showing the confirmation dialog before running the mutation.
   */
  onDeleteFranchise: (fran: Franchise) => void
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
  const [search, setSearch] = useState("")

  const visibleFranchises = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return franchises
    return franchises.filter((fran) =>
      `${fran.name} ${fran.code} ${fran.id}`.toLowerCase().includes(q)
    )
  }, [franchises, search])

  const columnCount = 6

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SectionHeading title="Franchise Brands" />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name or code…"
            ariaLabel="Search franchises"
            className="w-full sm:w-56"
          />
          <Button size="small" onClick={onAddFranchise}>
            Add Franchise
          </Button>
        </div>
      </div>

      {!isLoading && franchises.length === 0 ? (
        <EmptyState
          icon={<Buildings />}
          title="No franchises yet"
          description="Create your first franchise brand to start adding store locations and assigning admin users."
          primaryAction={{ label: "Add Franchise", onClick: onAddFranchise }}
        />
      ) : !isLoading && visibleFranchises.length === 0 ? (
        <EmptyState
          icon={<Buildings />}
          title="No franchises match your search"
          description={`Nothing found for “${search.trim()}”. Try a different name or code.`}
          secondaryAction={{ label: "Clear search", onClick: () => setSearch("") }}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>ID</Table.HeaderCell>
                <Table.HeaderCell>Brand Name</Table.HeaderCell>
                <Table.HeaderCell>Code / Tenant Slug</Table.HeaderCell>
                <Table.HeaderCell>Locations</Table.HeaderCell>
                {/* Replaced static dot indicator with an actionable Switch */}
                <Table.HeaderCell>Active</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            {isLoading ? (
              <TableBodySkeleton rows={3} columns={columnCount} />
            ) : (
              <Table.Body>
                {visibleFranchises.map((fran) => (
                  <Table.Row key={fran.id}>
                    <Table.Cell>
                      <div className="flex items-center gap-1">
                        <Text size="xsmall" className="font-mono text-ui-fg-subtle">
                          {fran.id.slice(0, 14)}…
                        </Text>
                        <Copy content={fran.id} variant="mini" />
                      </div>
                    </Table.Cell>
                    <Table.Cell className="font-medium">{fran.name}</Table.Cell>
                    <Table.Cell className="font-mono text-xs text-ui-fg-subtle">
                      {fran.code}
                    </Table.Cell>
                    <Table.Cell>
                      {fran.store_locations?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {fran.store_locations.map((loc) => (
                            <Badge key={loc.id} color="blue" size="2xsmall">
                              {loc.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <Text size="xsmall" className="text-ui-fg-muted">
                          None
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {/*
                        Quick-toggle: fires onToggleFranchiseActive which triggers an
                        optimistic cache update in the parent before the PATCH lands.
                      */}
                      <Switch
                        checked={fran.is_active}
                        onCheckedChange={(value) =>
                          onToggleFranchiseActive(fran.id, value)
                        }
                        aria-label={`Toggle ${fran.name} active`}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center justify-end gap-2">
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
                          onClick={() => onDeleteFranchise(fran)}
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
