import React from "react"
import { Button, FocusModal, Heading, Input, Label, Switch, Text } from "@medusajs/ui"
import type { StoreLocation } from "../routes/super-admin/_components/types"
import { FormField } from "./ui"

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

            {/* Name */}
            <FormField
              id="floc-name"
              label="Location Name"
              required
              helper="The unique store code will be automatically generated from the franchise context on save."
            >
              <Input
                id="floc-name"
                placeholder="e.g. Koramangala Kitchen"
                value={locName}
                onChange={(e) => onNameChange(e.target.value)}
                required
                autoComplete="off"
              />
            </FormField>

            {/* Address */}
            <FormField id="floc-address" label="Physical Street Address">
              <Input
                id="floc-address"
                placeholder="e.g. 12th Main Road, Koramangala, Bengaluru"
                value={locAddress}
                onChange={(e) => onAddressChange(e.target.value)}
                autoComplete="off"
              />
            </FormField>

            {/* Lat / Lng */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField id="floc-lat" label="Latitude">
                <Input
                  id="floc-lat"
                  type="number"
                  step="0.000001"
                  placeholder="12.9348"
                  value={locLat}
                  onChange={(e) => onLatChange(e.target.value)}
                />
              </FormField>
              <FormField id="floc-lng" label="Longitude">
                <Input
                  id="floc-lng"
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
                id="floc-lead"
                label="Lead Time (Hours)"
                helper="Minimum notice before collection."
              >
                <Input
                  id="floc-lead"
                  type="number"
                  min={0}
                  value={locLeadTime}
                  onChange={(e) => onLeadTimeChange(e.target.value)}
                />
              </FormField>
              <FormField
                id="floc-capacity"
                label="Orders Capacity / Slot"
                helper="Max orders per time slot."
              >
                <Input
                  id="floc-capacity"
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
                <Label htmlFor="floc-active">Show Location</Label>
                <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
                  Visible on the storefront finder and open for routing.
                </Text>
              </div>
              <Switch
                id="floc-active"
                checked={locActive}
                onCheckedChange={onActiveChange}
                className="shrink-0"
              />
            </div>

            {/* Accepting orders toggle — disabled when location itself is not active */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-ui-border-base px-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="floc-accepting">Accepting Orders</Label>
                <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
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
                className="shrink-0"
              />
            </div>

          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending} disabled={!locName}>
              {isEdit ? "Save Changes" : "Create Location"}
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
