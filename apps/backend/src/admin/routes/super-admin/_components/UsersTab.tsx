import React from "react"
import { Badge, Button, Heading, Table, Text } from "@medusajs/ui"
import type { UserRecord } from "./types"

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
  onUnlinkUser: (userId: string, franchiseId: string) => void
  onResetPassword: (user: UserRecord) => void
  /** Store-level assignment handlers */
  onAssignUserToStore?: () => void
  onUnlinkUserFromStore?: (userId: string, storeLocationId: string) => void
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
  // Exclude the currently logged-in super-admin from the list.
  // They appear in the user table but cannot be managed by themselves,
  // which creates confusing UX (e.g. accidentally revoking own access).
  const visibleUsers = currentUserId
    ? users.filter((u) => u.id !== currentUserId)
    : users
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Heading level="h2">Administrative User Permissions</Heading>
        <div className="flex items-center gap-2">
          <Button
            size="small"
            variant="secondary"
            onClick={onCreateUser}
          >
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

      {isLoading ? (
        <Text className="text-ui-fg-subtle">Loading user database...</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Email Address</Table.HeaderCell>
              <Table.HeaderCell>Full Name</Table.HeaderCell>
              <Table.HeaderCell>Assigned Franchises</Table.HeaderCell>
              <Table.HeaderCell>Store Assignments</Table.HeaderCell>
              <Table.HeaderCell>Access Level</Table.HeaderCell>
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {visibleUsers.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={6} className="text-center py-4">
                  <Text className="text-ui-fg-muted">No admin users found.</Text>
                </Table.Cell>
              </Table.Row>
            ) : (
              visibleUsers.map((usr) => (
                <Table.Row key={usr.id}>
                  <Table.Cell className="font-semibold">{usr.email}</Table.Cell>
                  <Table.Cell>
                    {usr.first_name || usr.last_name
                      ? `${usr.first_name || ""} ${usr.last_name || ""}`.trim()
                      : <span className="text-ui-fg-muted italic">Unnamed</span>}
                  </Table.Cell>
                  <Table.Cell>
                    {usr.metadata?.is_super_admin === true ? (
                      <Badge color="red" size="xsmall">Global Super Admin</Badge>
                    ) : usr.franchise?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {usr.franchise.map((fran) => (
                          <Badge key={fran.id} color="blue" size="xsmall" className="pr-1">
                            {fran.name}
                            <button
                              type="button"
                              onClick={() => onUnlinkUser(usr.id, fran.id)}
                              className="ml-1.5 font-bold hover:text-red-500 transition-colors"
                              title="Revoke franchise access"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Badge color="grey" size="xsmall">Unassigned</Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {usr.metadata?.is_super_admin === true ? (
                      <Text size="xsmall" className="text-ui-fg-muted italic">N/A</Text>
                    ) : usr.store_locations?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {usr.store_locations.map((store) => (
                          <Badge key={store.id} color="purple" size="xsmall" className="pr-1">
                            📍 {store.name}
                            {onUnlinkUserFromStore && (
                              <button
                                type="button"
                                onClick={() => onUnlinkUserFromStore(usr.id, store.id)}
                                className="ml-1.5 font-bold hover:text-red-500 transition-colors"
                                title="Remove store assignment"
                              >
                                ×
                              </button>
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
                      <Text size="small" className="text-ui-fg-interactive font-bold">Super Admin</Text>
                    ) : usr.store_locations?.length ? (
                      <Text size="small" className="text-purple-600 font-semibold">Branch Manager</Text>
                    ) : (
                      <Text size="small" className="text-ui-fg-subtle">Franchise Owner</Text>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => onResetPassword(usr)}
                    >
                      Reset Password
                    </Button>
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

