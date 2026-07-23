import React from "react"
import { Button, FocusModal, Heading, Input, Label, Select, Switch, Text } from "@medusajs/ui"
import type { Franchise, StoreLocation } from "./types"
import { FormField } from "../../../components/ui"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LocationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedLocation: StoreLocation | null
  franchises: Franchise[]
  locName: string
  locCode: string
  locFranId: string
  locAddress: string
  locLat: string
  locLng: string
  locActive: boolean
  locAccepting: boolean
  locLeadTime: string
  locCapacity: string
  onNameChange: (v: string) => void
  onCodeChange: (v: string) => void
  onFranIdChange: (v: string) => void
  onAddressChange: (v: string) => void
  onLatChange: (v: string) => void
  onLngChange: (v: string) => void
  onActiveChange: (v: boolean) => void
  onAcceptingChange: (v: boolean) => void
  onLeadTimeChange: (v: string) => void
  onCapacityChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  isPending: boolean
}

// ---------------------------------------------------------------------------
// LocationModal — create or edit a store location
// ---------------------------------------------------------------------------

export const LocationModal = ({
  open,
  onOpenChange,
  selectedLocation,
  franchises,
  locName,
  locCode,
  locFranId,
  locAddress,
  locLat,
  locLng,
  locActive,
  locAccepting,
  locLeadTime,
  locCapacity,
  onNameChange,
  onCodeChange,
  onFranIdChange,
  onAddressChange,
  onLatChange,
  onLngChange,
  onActiveChange,
  onAcceptingChange,
  onLeadTimeChange,
  onCapacityChange,
  onSubmit,
  isPending,
}: LocationModalProps) => {
  const isEdit = !!selectedLocation

  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <form onSubmit={onSubmit}>
          <FocusModal.Header>
            <div className="flex items-center gap-2">
              <FocusModal.Title asChild>
                <Heading level="h2">{isEdit ? "Modify Store Location Settings" : "Configure New Store Location"}</Heading>
              </FocusModal.Title>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">

            {/* Name + Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField id="loc-name" label="Location Name" required>
                <Input
                  id="loc-name"
                  placeholder="e.g. Cake Break – Koramangala"
                  value={locName}
                  onChange={(e) => onNameChange(e.target.value)}
                  autoComplete="off"
                />
              </FormField>
              <FormField id="loc-code" label="Location Code" required>
                <Input
                  id="loc-code"
                  placeholder="e.g. CB-KOR"
                  value={locCode}
                  onChange={(e) => onCodeChange(e.target.value)}
                  disabled={isEdit}
                  autoComplete="off"
                  className="font-mono"
                />
              </FormField>
            </div>

            {/*
              Parent Franchise
              - CREATE mode: enabled, empty placeholder forces an explicit selection.
              - EDIT mode: disabled — franchise_id is immutable after creation
                because changing it would orphan the store ↔ stock location link
                engine links, corrupting inventory scoping across tenants.
            */}
            <FormField
              id="loc-franchise"
              label="Parent Franchise Brand"
              required
              helper={
                isEdit
                  ? "Franchise cannot be changed after creation — doing so would orphan inventory and stock location links for this store."
                  : "Required. Cannot be changed after saving."
              }
            >
              <Select
                value={locFranId || undefined}
                onValueChange={onFranIdChange}
                disabled={isEdit}
              >
                <Select.Trigger id="loc-franchise" className="w-full">
                  <Select.Value placeholder="Select a franchise brand…" />
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

            {/* Address */}
            <FormField id="loc-address" label="Physical Street Address">
              <Input
                id="loc-address"
                placeholder="e.g. 12th Main Road, Koramangala, Bengaluru"
                value={locAddress}
                onChange={(e) => onAddressChange(e.target.value)}
                autoComplete="off"
              />
            </FormField>

            {/* Lat / Lng */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField id="loc-lat" label="Latitude">
                <Input
                  id="loc-lat"
                  type="number"
                  step="0.000001"
                  placeholder="12.9348"
                  value={locLat}
                  onChange={(e) => onLatChange(e.target.value)}
                />
              </FormField>
              <FormField id="loc-lng" label="Longitude">
                <Input
                  id="loc-lng"
                  type="number"
                  step="0.000001"
                  placeholder="77.6189"
                  value={locLng}
                  onChange={(e) => onLngChange(e.target.value)}
                />
              </FormField>
            </div>

            {/* Lead Time + Capacity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                id="loc-lead"
                label="Lead Time (Hours)"
                helper="Minimum notice before collection."
              >
                <Input
                  id="loc-lead"
                  type="number"
                  min={0}
                  value={locLeadTime}
                  onChange={(e) => onLeadTimeChange(e.target.value)}
                />
              </FormField>
              <FormField
                id="loc-capacity"
                label="Orders Capacity / Slot"
                helper="Max orders per time slot."
              >
                <Input
                  id="loc-capacity"
                  type="number"
                  min={0}
                  value={locCapacity}
                  onChange={(e) => onCapacityChange(e.target.value)}
                />
              </FormField>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-ui-border-base px-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="loc-active">Show Location</Label>
                <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
                  Visible on the storefront finder and open for routing.
                </Text>
              </div>
              <Switch
                id="loc-active"
                checked={locActive}
                onCheckedChange={onActiveChange}
                className="shrink-0"
              />
            </div>

            {/* Accepting orders toggle — disabled when location itself is not active */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-ui-border-base px-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="loc-accepting">Accepting Orders</Label>
                <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
                  {locActive
                    ? "Temporarily toggle off during kitchen rush or holidays."
                    : "Enable the location first before accepting orders."}
                </Text>
              </div>
              <Switch
                id="loc-accepting"
                checked={locAccepting}
                // Accepting orders is meaningless when the location is hidden/inactive
                disabled={!locActive}
                onCheckedChange={onAcceptingChange}
                className="shrink-0"
              />
            </div>

          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isPending}
              disabled={!locName || !locCode || !locFranId}
            >
              {isEdit ? "Save Changes" : "Create Location"}
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
