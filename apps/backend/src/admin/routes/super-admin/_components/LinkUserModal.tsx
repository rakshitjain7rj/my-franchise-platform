import React from "react"
import { Button, FocusModal, Heading, Label } from "@medusajs/ui"
import type { Franchise, UserRecord } from "./types"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LinkUserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  users: UserRecord[]
  franchises: Franchise[]
  linkUserId: string
  linkFranId: string
  onUserChange: (v: string) => void
  onFranchiseChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  isPending: boolean
  onCreateUserClick?: () => void
}

// ---------------------------------------------------------------------------
// LinkUserModal — assign an admin user to a franchise
// ---------------------------------------------------------------------------

export const LinkUserModal = ({
  open,
  onOpenChange,
  users,
  franchises,
  linkUserId,
  linkFranId,
  onUserChange,
  onFranchiseChange,
  onSubmit,
  isPending,
  onCreateUserClick,
}: LinkUserModalProps) => {
  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <form onSubmit={onSubmit}>
          <FocusModal.Header>
            <div className="flex items-center gap-2">
              <Heading level="h2">Link Admin User to Franchise</Heading>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="link-user">Select Admin User</Label>
                {onCreateUserClick && (
                  <button
                    type="button"
                    onClick={onCreateUserClick}
                    className="text-xs text-ui-fg-interactive hover:underline focus:outline-none"
                  >
                    Create new user
                  </button>
                )}
              </div>
              <select
                id="link-user"
                value={linkUserId}
                onChange={(e) => onUserChange(e.target.value)}
                className="w-full bg-ui-bg-field border border-ui-border-base focus:border-ui-border-interactive rounded-md h-10 px-3 text-sm outline-none"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} ({u.first_name || ""} {u.last_name || ""})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="link-franchise">Select Franchise Brand</Label>
              <select
                id="link-franchise"
                value={linkFranId}
                onChange={(e) => onFranchiseChange(e.target.value)}
                className="w-full bg-ui-bg-field border border-ui-border-base focus:border-ui-border-interactive rounded-md h-10 px-3 text-sm outline-none"
              >
                {franchises.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.code})
                  </option>
                ))}
              </select>
            </div>

          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending}>
              Create Permission Link
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
