import React from "react"
import { Button, FocusModal, Heading, Input, Label, Switch, Text } from "@medusajs/ui"
import type { Franchise } from "./types"
import { FormField } from "../../../components/ui"

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
              <FocusModal.Title asChild>
                <Heading level="h2">{selectedFranchise ? "Modify Franchise Details" : "Create New Franchise Brand"}</Heading>
              </FocusModal.Title>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">
            <FormField id="fran-name" label="Brand Name" required>
              <Input
                id="fran-name"
                placeholder="e.g. Cake Break"
                value={franName}
                onChange={(e) => onNameChange(e.target.value)}
                autoComplete="off"
              />
            </FormField>

            <FormField
              id="fran-code"
              label="Tenant Slug / Unique Code"
              required
              helper="Lowercase letters, numbers, and dashes only. This is permanent."
            >
              <Input
                id="fran-code"
                placeholder="e.g. cakebreak"
                value={franCode}
                onChange={(e) => onCodeChange(e.target.value)}
                disabled={!!selectedFranchise}
                autoComplete="off"
                className="font-mono"
              />
            </FormField>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-ui-border-base px-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="fran-active">Enable Franchise</Label>
                <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
                  When inactive, all underlying baking locations are shut down.
                </Text>
              </div>
              <Switch
                id="fran-active"
                checked={franActive}
                onCheckedChange={onActiveChange}
                className="shrink-0"
              />
            </div>
          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending} disabled={!franName || !franCode}>
              {selectedFranchise ? "Save Changes" : "Create Franchise"}
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
