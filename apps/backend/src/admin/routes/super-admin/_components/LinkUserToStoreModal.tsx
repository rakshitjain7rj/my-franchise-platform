import React from "react"
import { Button, FocusModal, Heading, Label, Text } from "@medusajs/ui"
import type { Franchise, StoreLocation, UserRecord } from "./types"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LinkUserToStoreModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** All admin users (filtered to non-super-admins who belong to a franchise) */
  users: UserRecord[]
  /** All store locations across franchises */
  locations: StoreLocation[]
  /** All franchises — used to filter locations by the selected user's franchise */
  franchises: Franchise[]
  linkUserId: string
  linkStoreLocationId: string
  onUserChange: (v: string) => void
  onStoreLocationChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  isPending: boolean
}

// ---------------------------------------------------------------------------
// LinkUserToStoreModal — assign a branch manager to a store location
// ---------------------------------------------------------------------------

export const LinkUserToStoreModal = ({
  open,
  onOpenChange,
  users,
  locations,
  franchises,
  linkUserId,
  linkStoreLocationId,
  onUserChange,
  onStoreLocationChange,
  onSubmit,
  isPending,
}: LinkUserToStoreModalProps) => {
  // Filter users to only franchise admins (not super-admins, not unassigned)
  const eligibleUsers = users.filter(
    (u) => u.metadata?.is_super_admin !== true && u.franchise && u.franchise.length > 0
  )

  // Get the selected user's franchise IDs for location filtering
  const selectedUser = eligibleUsers.find((u) => u.id === linkUserId)
  const userFranchiseIds = new Set(
    (selectedUser?.franchise ?? []).map((f) => f.id)
  )

  // Filter locations to only those belonging to the user's franchise(s)
  const eligibleLocations = locations.filter((loc) =>
    userFranchiseIds.has(loc.franchise?.id)
  )

  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <form onSubmit={onSubmit}>
          <FocusModal.Header>
            <div className="flex items-center gap-2">
              <Heading level="h2">Assign User to Store Location</Heading>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">
            <Text className="text-ui-fg-subtle text-sm">
              Assign a franchise admin as a branch manager for a specific store.
              Once assigned, they will only see orders from their assigned store(s).
              Users without store assignments see all franchise data.
            </Text>

            <div className="flex flex-col gap-2">
              <Label htmlFor="link-store-user">Select Admin User</Label>
              <select
                id="link-store-user"
                value={linkUserId}
                onChange={(e) => onUserChange(e.target.value)}
                className="w-full bg-ui-bg-field border border-ui-border-base focus:border-ui-border-interactive rounded-md h-10 px-3 text-sm outline-none"
              >
                <option value="">— Select a user —</option>
                {eligibleUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} ({u.first_name || ""} {u.last_name || ""}) —{" "}
                    {u.franchise?.map((f) => f.name).join(", ") || "No franchise"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="link-store-location">Select Store Location</Label>
              {!linkUserId ? (
                <Text className="text-ui-fg-muted text-sm italic">
                  Select a user first to see available store locations.
                </Text>
              ) : eligibleLocations.length === 0 ? (
                <Text className="text-ui-fg-muted text-sm italic">
                  No store locations found for this user&apos;s franchise.
                </Text>
              ) : (
                <select
                  id="link-store-location"
                  value={linkStoreLocationId}
                  onChange={(e) => onStoreLocationChange(e.target.value)}
                  className="w-full bg-ui-bg-field border border-ui-border-base focus:border-ui-border-interactive rounded-md h-10 px-3 text-sm outline-none"
                >
                  <option value="">— Select a store —</option>
                  {eligibleLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code}) — {loc.franchise?.name || "Unknown"}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isPending}
              disabled={!linkUserId || !linkStoreLocationId}
            >
              Assign to Store
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
