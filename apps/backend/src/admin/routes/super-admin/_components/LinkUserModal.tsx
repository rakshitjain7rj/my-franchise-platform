import React from "react"
import { Button, FocusModal, Heading, Select } from "@medusajs/ui"
import type { Franchise, UserRecord } from "./types"
import { FormField } from "../../../components/ui"

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
  const displayName = (u: UserRecord) =>
    `${u.email}${u.first_name || u.last_name ? ` (${`${u.first_name || ""} ${u.last_name || ""}`.trim()})` : ""}`

  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <form onSubmit={onSubmit}>
          <FocusModal.Header>
            <div className="flex items-center gap-2">
              <FocusModal.Title asChild>
                <Heading level="h2">Link Admin User to Franchise</Heading>
              </FocusModal.Title>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">

            <FormField id="link-user" label="Select Admin User" required>
              <div className="flex flex-col gap-2">
                <Select value={linkUserId || undefined} onValueChange={onUserChange}>
                  <Select.Trigger id="link-user" className="w-full">
                    <Select.Value placeholder="Select a user…" />
                  </Select.Trigger>
                  <Select.Content>
                    {users.map((u) => (
                      <Select.Item key={u.id} value={u.id}>
                        {displayName(u)}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
                {onCreateUserClick && (
                  <button
                    type="button"
                    onClick={onCreateUserClick}
                    className="self-start text-xs text-ui-fg-interactive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-bg-interactive rounded"
                  >
                    Create new user
                  </button>
                )}
              </div>
            </FormField>

            <FormField id="link-franchise" label="Select Franchise Brand" required>
              <Select value={linkFranId || undefined} onValueChange={onFranchiseChange}>
                <Select.Trigger id="link-franchise" className="w-full">
                  <Select.Value placeholder="Select a franchise…" />
                </Select.Trigger>
                <Select.Content>
                  {franchises.map((f) => (
                    <Select.Item key={f.id} value={f.id}>
                      {f.name} ({f.code})
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </FormField>

          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isPending}
              disabled={!linkUserId || !linkFranId}
            >
              Create Permission Link
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
