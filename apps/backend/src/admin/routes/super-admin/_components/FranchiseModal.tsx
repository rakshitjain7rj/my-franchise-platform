import React from "react"
import { Button, FocusModal, Heading, Input, Label, Switch, Text } from "@medusajs/ui"
import type { Franchise } from "./types"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FranchiseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedFranchise: Franchise | null
  franName: string
  franCode: string
  franActive: boolean
  onNameChange: (value: string) => void
  onCodeChange: (value: string) => void
  onActiveChange: (value: boolean) => void
  onSubmit: (e: React.FormEvent) => void
  isPending: boolean
}

// ---------------------------------------------------------------------------
// FranchiseModal — create or edit a franchise brand
// ---------------------------------------------------------------------------

export const FranchiseModal = ({
  open,
  onOpenChange,
  selectedFranchise,
  franName,
  franCode,
  franActive,
  onNameChange,
  onCodeChange,
  onActiveChange,
  onSubmit,
  isPending,
}: FranchiseModalProps) => {
  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <form onSubmit={onSubmit}>
          <FocusModal.Header>
            <div className="flex items-center gap-2">
              <Heading level="h2">
                {selectedFranchise ? "Modify Franchise Details" : "Create New Franchise Brand"}
              </Heading>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">
            <div className="flex flex-col gap-2">
              <Label htmlFor="fran-name">Brand Name</Label>
              <Input
                id="fran-name"
                placeholder="e.g. Cake Break Koramangala"
                value={franName}
                onChange={(e) => onNameChange(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="fran-code">Tenant Slug / Unique Code</Label>
              <Input
                id="fran-code"
                placeholder="e.g. cb-koramangala"
                value={franCode}
                onChange={(e) => onCodeChange(e.target.value)}
                disabled={!!selectedFranchise}
              />
              <Text size="xsmall" className="text-ui-fg-subtle">
                Must be lowercase letters, numbers, and dashes. This is permanent.
              </Text>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="fran-active">Enable Franchise</Label>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  When inactive, all underlying baking locations are shut down.
                </Text>
              </div>
              <Switch id="fran-active" checked={franActive} onCheckedChange={onActiveChange} />
            </div>
          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending}>
              Save Franchise
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
