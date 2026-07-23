import { useMemo, useState } from "react"
import { Badge, Button, Table, Text, Tooltip } from "@medusajs/ui"
import { Users, XMarkMini } from "@medusajs/icons"
import type { UserRecord } from "./types"
import {
  EmptyState,
  SearchInput,
  SectionHeading,
  TableBodySkeleton,
} from "../../../components/ui"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface UsersTabProps {
  users: UserRecord[]
  isLoading: boolean
  /** Needed to disable the "Assign" button when no franchises exist yet */
  franchisesCount: number
  /**
   * The ID of the currently authenticated super-admin.
   * This user is excluded from the visible list to prevent them from
   * accidentally managing their own access or seeing themselves in the table.
   */
  currentUserId?: string
  onCreateUser: () => void
  onAssignUser: () => void
  /**
   * Called when the user revokes a franchise link. The parent is responsible
   * for showing the confirmation dialog before running the mutation.
   */
  onUnlinkUser: (user: UserRecord, franchise: { id: string; name: string }) => void
  onResetPassword: (user: UserRecord) => void
  /** Store-level assignment handlers */
  onAssignUserToStore?: () => void
  /**
   * Called when the user removes a store assignment. The parent is
   * responsible for showing the confirmation dialog before the mutation.
   */
  onUnlinkUserFromStore?: (
    user: UserRecord,
    store: { id: string; name: string; code: string }
  ) => void
}

// ---------------------------------------------------------------------------
// UsersTab
// ---------------------------------------------------------------------------

export const UsersTab = ({
  users,
  isLoading,
  franchisesCount,
  currentUserId,
  onCreateUser,
  onAssignUser,
  onUnlinkUser,
  onResetPassword,
  onAssignUserToStore,
  onUnlinkUserFromStore,
}: UsersTabProps) => {
  const [search, setSearch] = useState("")

  // Exclude the currently logged-in super-admin from the list.
  // They appear in the user table but cannot be managed by themselves,
  // which creates confusing UX (e.g. accidentally revoking own access).
  const visibleUsers = useMemo(() => {
    const scoped = currentUserId
      ? users.filter((u) => u.id !== currentUserId)
      : users
    const q = search.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((usr) =>
      `${usr.email} ${usr.first_name ?? ""} ${usr.last_name ?? ""}`
        .toLowerCase()
        .includes(q)
    )
  }, [users, currentUserId, search])

  const columnCount = 6

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SectionHeading title="Administrative User Permissions" />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search email or name…"
            ariaLabel="Search users"
            className="w-full sm:w-56"
          />
          <Button size="small" variant="secondary" onClick={onCreateUser}>
            Create New User
          </Button>
          <Button
            size="small"
            onClick={onAssignUser}
            disabled={franchisesCount === 0 || visibleUsers.length === 0}
          >
            Assign User to Franchise
          </Button>
          {onAssignUserToStore && (
            <Button
              size="small"
              variant="secondary"
              onClick={onAssignUserToStore}
              disabled={visibleUsers.length === 0}
            >
              Assign to Store
            </Button>
          )}
        </div>
      </div>

      {!isLoading && users.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No admin users yet"
          description="Create an admin account, then assign it to a franchise so the owner can manage their brand."
          primaryAction={{ label: "Create New User", onClick: onCreateUser }}
        />
      ) : !isLoading && visibleUsers.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No users match your search"
          description={`Nothing found for “${search.trim()}”. Try a different email or name.`}
          secondaryAction={{ label: "Clear search", onClick: () => setSearch("") }}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Email Address</Table.HeaderCell>
                <Table.HeaderCell>Full Name</Table.HeaderCell>
                <Table.HeaderCell>Assigned Franchises</Table.HeaderCell>
                <Table.HeaderCell>Store Assignments</Table.HeaderCell>
                <Table.HeaderCell>Access Level</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            {isLoading ? (
              <TableBodySkeleton rows={4} columns={columnCount} />
            ) : (
              <Table.Body>
                {visibleUsers.map((usr) => (
                  <Table.Row key={usr.id}>
                    <Table.Cell className="font-medium">{usr.email}</Table.Cell>
                    <Table.Cell>
                      {usr.first_name || usr.last_name ? (
                        `${usr.first_name || ""} ${usr.last_name || ""}`.trim()
                      ) : (
                        <span className="text-ui-fg-muted italic">Unnamed</span>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {usr.metadata?.is_super_admin === true ? (
                        <Badge color="red" size="2xsmall">
                          Global Super Admin
                        </Badge>
                      ) : usr.franchise?.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {usr.franchise.map((fran) => (
                            <Badge
                              key={fran.id}
                              color="blue"
                              size="2xsmall"
                              className="pr-1"
                            >
                              {fran.name}
                              <Tooltip content={`Revoke access to ${fran.name}`}>
                                <button
                                  type="button"
                                  onClick={() => onUnlinkUser(usr, fran)}
                                  className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:text-ui-fg-error focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ui-bg-interactive"
                                  aria-label={`Revoke ${usr.email}'s access to ${fran.name}`}
                                >
                                  <XMarkMini />
                                </button>
                              </Tooltip>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <Badge color="grey" size="2xsmall">
                          Unassigned
                        </Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {usr.metadata?.is_super_admin === true ? (
                        <Text size="xsmall" className="text-ui-fg-muted italic">
                          N/A
                        </Text>
                      ) : usr.store_locations?.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {usr.store_locations.map((store) => (
                            <Badge
                              key={store.id}
                              color="purple"
                              size="2xsmall"
                              className="pr-1"
                            >
                              {store.name}
                              {onUnlinkUserFromStore && (
                                <Tooltip content={`Remove assignment to ${store.name}`}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUnlinkUserFromStore(usr, store)
                                    }
                                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:text-ui-fg-error focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ui-bg-interactive"
                                    aria-label={`Remove ${usr.email}'s assignment to ${store.name}`}
                                  >
                                    <XMarkMini />
                                  </button>
                                </Tooltip>
                              )}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <Text size="xsmall" className="text-ui-fg-muted italic">
                          All stores (franchise-wide)
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {usr.metadata?.is_super_admin === true ? (
                        <Badge color="red" size="2xsmall">
                          Super Admin
                        </Badge>
                      ) : usr.store_locations?.length ? (
                        <Badge color="purple" size="2xsmall">
                          Branch Manager
                        </Badge>
                      ) : (
                        <Badge color="grey" size="2xsmall">
                          Franchise Owner
                        </Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end">
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => onResetPassword(usr)}
                        >
                          Reset Password
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
