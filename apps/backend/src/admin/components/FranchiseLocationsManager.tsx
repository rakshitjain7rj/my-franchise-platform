import React, { useState } from "react"
import { Badge, Button, Heading, Switch, Table, Text, Container, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useFranchise } from "../providers/FranchiseContext"
import { useFranchiseFetch } from "../lib/sdk"
import { FranchiseLocationModal } from "./FranchiseLocationModal"
import type { StoreLocation } from "../routes/super-admin/_components/types"

export const FranchiseLocationsManager = () => {
  const queryClient = useQueryClient()
  const { activeFranchiseId } = useFranchise()
  const franchiseFetch = useFranchiseFetch()

  // ── Modal visibility ────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<StoreLocation | null>(null)

  // ── Form State ──────────────────────────────────────────────────────────────
  const [locName, setLocName] = useState("")
  const [locAddress, setLocAddress] = useState("")
  const [locLat, setLocLat] = useState("")
  const [locLng, setLocLng] = useState("")
  const [locActive, setLocActive] = useState(true)
  const [locAccepting, setLocAccepting] = useState(true)
  const [locLeadTime, setLocLeadTime] = useState("24")
  const [locCapacity, setLocCapacity] = useState("10")

  // ── Query: Fetch locations ──────────────────────────────────────────────────
  const queryKey = ["franchise-locations", activeFranchiseId]
  const { data: locationsData, isLoading } = useQuery<{ locations: StoreLocation[] }>({
    queryKey,
    queryFn: () =>
      franchiseFetch("/admin/franchise-locations") as Promise<{ locations: StoreLocation[] }>,
    enabled: !!activeFranchiseId,
  })

  const locations = locationsData?.locations || []

  // ── Mutations ───────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (payload: {
      id?: string
      name: string
      address: string
      latitude: number | null
      longitude: number | null
      is_active: boolean
      is_accepting_orders: boolean
      custom_lead_time_hours: number
      daily_order_capacity: number
    }) => {
      if (payload.id) {
        const { id, ...updateFields } = payload
        return franchiseFetch(`/admin/franchise-locations/${id}`, {
          method: "PATCH",
          body: updateFields,
        })
      } else {
        return franchiseFetch("/admin/franchise-locations", {
          method: "POST",
          body: payload,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: ["franchise-dashboard"] })
      setModalOpen(false)
      setSelectedLocation(null)
      toast.success("Success", { description: "Store location saved successfully." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to save store location." })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (payload: {
      id: string
      field: "is_active" | "is_accepting_orders" | "is_default"
      value: boolean
    }) => {
      return franchiseFetch(`/admin/franchise-locations/${payload.id}`, {
        method: "PATCH",
        body: { [payload.field]: payload.value },
      })
    },
    onMutate: async ({ id, field, value }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<{ locations: StoreLocation[] }>(queryKey)
      queryClient.setQueryData<{ locations: StoreLocation[] }>(queryKey, (old) => {
        const locations = old?.locations ?? []
        if (field === "is_default" && value === true) {
          return {
            locations: locations.map((l) => ({
              ...l,
              is_default: l.id === id,
            })),
          }
        }
        return {
          locations: locations.map((l) =>
            l.id === id ? { ...l, [field]: value } : l
          ),
        }
      })
      return { previous }
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
      toast.error("Error", { description: err.message || "Failed to toggle status." })
    },
    onSuccess: (_data, vars) => {
      if (vars.field === "is_default" && vars.value) {
        toast.success("Default store updated", {
          description: "New storefront visitors will be pre-selected on this bakery.",
        })
      } else {
        toast.success("Updated", { description: "Location status updated." })
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: ["franchise-dashboard"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      return franchiseFetch(`/admin/franchise-locations/${id}`, {
        method: "DELETE",
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: ["franchise-dashboard"] })
      toast.success("Deleted", { description: "Store location deleted successfully." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to delete location." })
    },
  })

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAddLocation = () => {
    setSelectedLocation(null)
    setLocName("")
    setLocAddress("")
    setLocLat("")
    setLocLng("")
    setLocActive(true)
    setLocAccepting(true)
    setLocLeadTime("24")
    setLocCapacity("10")
    setModalOpen(true)
  }

  const handleEditLocation = (loc: StoreLocation) => {
    setSelectedLocation(loc)
    setLocName(loc.name)
    setLocAddress(loc.address || "")
    setLocLat(loc.latitude !== null ? String(loc.latitude) : "")
    setLocLng(loc.longitude !== null ? String(loc.longitude) : "")
    setLocActive(loc.is_active)
    setLocAccepting(loc.is_accepting_orders)
    setLocLeadTime(String(loc.custom_lead_time_hours))
    setLocCapacity(String(loc.daily_order_capacity))
    setModalOpen(true)
  }

  const handleDeleteLocation = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"? This will sever all linked stock connections.`)) {
      deleteMutation.mutate(id)
    }
  }

  const handleToggleLocation = (
    id: string,
    field: "is_active" | "is_accepting_orders" | "is_default",
    value: boolean
  ) => {
    toggleMutation.mutate({ id, field, value })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!locName) {
      toast.error("Validation Error", { description: "Name is required." })
      return
    }
    saveMutation.mutate({
      id: selectedLocation?.id,
      name: locName,
      address: locAddress,
      latitude: locLat ? parseFloat(locLat) : null,
      longitude: locLng ? parseFloat(locLng) : null,
      is_active: locActive,
      is_accepting_orders: locAccepting,
      custom_lead_time_hours: parseInt(locLeadTime) || 24,
      daily_order_capacity: parseInt(locCapacity) || 10,
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Container className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Heading level="h2">Store Locations</Heading>
        <Button size="small" onClick={handleAddLocation}>
          Add Location
        </Button>
      </div>

      {isLoading ? (
        <Text className="text-ui-fg-subtle">Loading store locations...</Text>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Code</Table.HeaderCell>
                <Table.HeaderCell>Location Name</Table.HeaderCell>
                <Table.HeaderCell>Address</Table.HeaderCell>
                <Table.HeaderCell>Lead Time</Table.HeaderCell>
                <Table.HeaderCell>Capacity</Table.HeaderCell>
                <Table.HeaderCell>Visible</Table.HeaderCell>
                <Table.HeaderCell>Orders</Table.HeaderCell>
                <Table.HeaderCell>Default</Table.HeaderCell>
                <Table.HeaderCell>Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {locations.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={9} className="text-center py-4">
                    <Text className="text-ui-fg-muted">No store locations found.</Text>
                  </Table.Cell>
                </Table.Row>
              ) : (
                locations.map((loc) => (
                  <Table.Row key={loc.id}>
                    <Table.Cell className="font-mono text-xs font-semibold">{loc.code}</Table.Cell>
                    <Table.Cell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{loc.name}</span>
                        {loc.is_default && (
                          <Badge color="green" size="xsmall">
                            Default
                          </Badge>
                        )}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-subtle max-w-xs truncate">
                      {loc.address || "-"}
                    </Table.Cell>
                    <Table.Cell className="text-xs">{loc.custom_lead_time_hours} hrs</Table.Cell>
                    <Table.Cell className="text-xs">{loc.daily_order_capacity} / slot</Table.Cell>
                    <Table.Cell>
                      <Switch
                        checked={loc.is_active}
                        onCheckedChange={(value) =>
                          handleToggleLocation(loc.id, "is_active", value)
                        }
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <div
                        title={
                          !loc.is_active
                            ? "Cannot accept orders when location is inactive"
                            : undefined
                        }
                        className="inline-flex"
                      >
                        <Switch
                          checked={loc.is_accepting_orders}
                          disabled={!loc.is_active}
                          onCheckedChange={(value) =>
                            handleToggleLocation(loc.id, "is_accepting_orders", value)
                          }
                        />
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div
                        title={
                          !loc.is_active
                            ? "Activate the location before setting it as default"
                            : loc.is_default
                              ? "This is the default store for new visitors"
                              : "Set as default store for new visitors"
                        }
                        className="inline-flex"
                      >
                        <Switch
                          checked={Boolean(loc.is_default)}
                          disabled={!loc.is_active && !loc.is_default}
                          onCheckedChange={(value) =>
                            handleToggleLocation(loc.id, "is_default", value)
                          }
                        />
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-2">
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => handleEditLocation(loc)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          variant="danger"
                          onClick={() => handleDeleteLocation(loc.id, loc.name)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table>
        </div>
      )}

      <FranchiseLocationModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        selectedLocation={selectedLocation}
        locName={locName}
        locAddress={locAddress}
        locLat={locLat}
        locLng={locLng}
        locActive={locActive}
        locAccepting={locAccepting}
        locLeadTime={locLeadTime}
        locCapacity={locCapacity}
        onNameChange={setLocName}
        onAddressChange={setLocAddress}
        onLatChange={setLocLat}
        onLngChange={setLocLng}
        onActiveChange={setLocActive}
        onAcceptingChange={setLocAccepting}
        onLeadTimeChange={setLocLeadTime}
        onCapacityChange={setLocCapacity}
        onSubmit={handleSubmit}
        isPending={saveMutation.isPending}
      />
    </Container>
  )
}
