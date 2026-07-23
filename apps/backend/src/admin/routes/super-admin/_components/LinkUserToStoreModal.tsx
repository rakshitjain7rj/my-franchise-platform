import React from "react"
import { Button, FocusModal, Heading, Select, Text } from "@medusajs/ui"
import type { Franchise, StoreLocation, UserRecord } from "./types"
import { FormField } from "../../../components/ui"

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
              <FocusModal.Title asChild>
                <Heading level="h2">Assign User to Store Location</Heading>
              </FocusModal.Title>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">
            <Text size="small" className="text-ui-fg-subtle">
              Assign a franchise admin as a branch manager for a specific store.
              Once assigned, they will only see orders from their assigned store(s).
              Users without store assignments see all franchise data.
            </Text>

            <FormField id="link-store-user" label="Select Admin User" required>
              <Select value={linkUserId || undefined} onValueChange={onUserChange}>
                <Select.Trigger id="link-store-user" className="w-full">
                  <Select.Value placeholder="Select a user…" />
                </Select.Trigger>
                <Select.Content>
                  {eligibleUsers.map((u) => (
                    <Select.Item key={u.id} value={u.id}>
                      {u.email}
                      {u.first_name || u.last_name
                        ? ` (${`${u.first_name || ""} ${u.last_name || ""}`.trim()})`
                        : ""}{" "}
                      — {u.franchise?.map((f) => f.name).join(", ") || "No franchise"}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </FormField>

            <FormField
              id="link-store-location"
              label="Select Store Location"
              required
              helper={
                !linkUserId
                  ? "Select a user first to see available store locations."
                  : eligibleLocations.length === 0
                    ? "No store locations found for this user's franchise."
                    : undefined
              }
            >
              <Select
                value={linkStoreLocationId || undefined}
                onValueChange={onStoreLocationChange}
                disabled={!linkUserId || eligibleLocations.length === 0}
              >
                <Select.Trigger id="link-store-location" className="w-full">
                  <Select.Value placeholder="Select a store…" />
                </Select.Trigger>
                <Select.Content>
                  {eligibleLocations.map((loc) => (
                    <Select.Item key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code}) — {loc.franchise?.name || "Unknown"}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </FormField>
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
