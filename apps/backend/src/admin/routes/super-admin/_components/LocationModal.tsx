import React from "react"
import { Button, FocusModal, Heading, Input, Label, Switch, Text } from "@medusajs/ui"
import type { Franchise, StoreLocation } from "./types"

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
  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <form onSubmit={onSubmit}>
          <FocusModal.Header>
            <div className="flex items-center gap-2">
              <Heading level="h2">
                {selectedLocation ? "Modify Store Location Settings" : "Configure New Store Location"}
              </Heading>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">

            {/* Name + Code */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="loc-name">Location Name</Label>
                <Input
                  id="loc-name"
                  placeholder="e.g. Cake Break - Koramangala"
                  value={locName}
                  onChange={(e) => onNameChange(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="loc-code">Location Code</Label>
                <Input
                  id="loc-code"
                  placeholder="e.g. CB-KOR"
                  value={locCode}
                  onChange={(e) => onCodeChange(e.target.value)}
                  disabled={!!selectedLocation}
                />
              </div>
            </div>

            {/*
              Parent Franchise
              - CREATE mode: enabled, empty placeholder forces an explicit selection.
              - EDIT mode: disabled — franchise_id is immutable after creation
                because changing it would orphan the store ↔ stock location link
                engine links, corrupting inventory scoping across tenants.
            */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="loc-franchise">Parent Franchise Brand</Label>
              <select
                id="loc-franchise"
                value={locFranId}
                onChange={(e) => onFranIdChange(e.target.value)}
                disabled={!!selectedLocation}
                // required only in create mode — forces an explicit franchise selection
                required={!selectedLocation}
                className="w-full bg-ui-bg-field hover:bg-ui-bg-field-hover border border-ui-border-base focus:border-ui-border-interactive rounded-md h-10 px-3 text-sm transition-colors outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* Placeholder shown only in create mode to force an explicit choice */}
                {!selectedLocation && (
                  <option value="" disabled>
                    — Select a Franchise Brand —
                  </option>
                )}
                {franchises.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.code})
                  </option>
                ))}
              </select>
              {selectedLocation ? (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  ⚠ Franchise cannot be changed after creation — doing so would orphan
                  inventory and stock location links for this store.
                </Text>
              ) : (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Required. Cannot be changed after saving.
                </Text>
              )}
            </div>

            {/* Address */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="loc-address">Physical Street Address</Label>
              <Input
                id="loc-address"
                placeholder="e.g. 12th Main Road, Koramangala, Bengaluru"
                value={locAddress}
                onChange={(e) => onAddressChange(e.target.value)}
              />
            </div>

            {/* Lat / Lng */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="loc-lat">Latitude</Label>
                <Input
                  id="loc-lat"
                  type="number"
                  step="0.000001"
                  placeholder="12.9348"
                  value={locLat}
                  onChange={(e) => onLatChange(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="loc-lng">Longitude</Label>
                <Input
                  id="loc-lng"
                  type="number"
                  step="0.000001"
                  placeholder="77.6189"
                  value={locLng}
                  onChange={(e) => onLngChange(e.target.value)}
                />
              </div>
            </div>

            {/* Lead Time + Capacity */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="loc-lead">Lead Time (Hours)</Label>
                <Input
                  id="loc-lead"
                  type="number"
                  value={locLeadTime}
                  onChange={(e) => onLeadTimeChange(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="loc-capacity">Orders Capacity / Slot</Label>
                <Input
                  id="loc-capacity"
                  type="number"
                  value={locCapacity}
                  onChange={(e) => onCapacityChange(e.target.value)}
                />
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="loc-active">Show Location</Label>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Visible on the storefront finder and open for routing.
                </Text>
              </div>
              <Switch id="loc-active" checked={locActive} onCheckedChange={onActiveChange} />
            </div>

            {/* Accepting orders toggle — disabled when location itself is not active */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="loc-accepting">Accepting Orders</Label>
                <Text size="xsmall" className="text-ui-fg-subtle">
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
              />
            </div>

          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending}>
              Save Store Location
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
