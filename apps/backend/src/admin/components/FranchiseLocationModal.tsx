import React from "react"
import { Button, FocusModal, Heading, Input, Label, Switch, Text } from "@medusajs/ui"
import type { StoreLocation } from "../routes/super-admin/_components/types"

interface FranchiseLocationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedLocation: StoreLocation | null
  locName: string
  locAddress: string
  locLat: string
  locLng: string
  locActive: boolean
  locAccepting: boolean
  locLeadTime: string
  locCapacity: string
  onNameChange: (v: string) => void
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

export const FranchiseLocationModal = ({
  open,
  onOpenChange,
  selectedLocation,
  locName,
  locAddress,
  locLat,
  locLng,
  locActive,
  locAccepting,
  locLeadTime,
  locCapacity,
  onNameChange,
  onAddressChange,
  onLatChange,
  onLngChange,
  onActiveChange,
  onAcceptingChange,
  onLeadTimeChange,
  onCapacityChange,
  onSubmit,
  isPending,
}: FranchiseLocationModalProps) => {
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

            {/* Name */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="floc-name">Location Name</Label>
              <Input
                id="floc-name"
                placeholder="e.g. Koramangala Kitchen"
                value={locName}
                onChange={(e) => onNameChange(e.target.value)}
                required
              />
              <Text size="xsmall" className="text-ui-fg-subtle">
                The unique store code will be automatically generated from the franchise context on save.
              </Text>
            </div>

            {/* Address */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="floc-address">Physical Street Address</Label>
              <Input
                id="floc-address"
                placeholder="e.g. 12th Main Road, Koramangala, Bengaluru"
                value={locAddress}
                onChange={(e) => onAddressChange(e.target.value)}
              />
            </div>

            {/* Lat / Lng */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="floc-lat">Latitude</Label>
                <Input
                  id="floc-lat"
                  type="number"
                  step="0.000001"
                  placeholder="12.9348"
                  value={locLat}
                  onChange={(e) => onLatChange(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="floc-lng">Longitude</Label>
                <Input
                  id="floc-lng"
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
                <Label htmlFor="floc-lead">Lead Time (Hours)</Label>
                <Input
                  id="floc-lead"
                  type="number"
                  value={locLeadTime}
                  onChange={(e) => onLeadTimeChange(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="floc-capacity">Orders Capacity / Slot</Label>
                <Input
                  id="floc-capacity"
                  type="number"
                  value={locCapacity}
                  onChange={(e) => onCapacityChange(e.target.value)}
                />
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="floc-active">Show Location</Label>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Visible on the storefront finder and open for routing.
                </Text>
              </div>
              <Switch id="floc-active" checked={locActive} onCheckedChange={onActiveChange} />
            </div>

            {/* Accepting orders toggle — disabled when location itself is not active */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="floc-accepting">Accepting Orders</Label>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {locActive
                    ? "Temporarily toggle off during kitchen rush or holidays."
                    : "Enable the location first before accepting orders."}
                </Text>
              </div>
              <Switch
                id="floc-accepting"
                checked={locAccepting}
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
