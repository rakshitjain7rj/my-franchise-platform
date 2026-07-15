import React, { useState, useEffect } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Wrench } from "@medusajs/icons"
import { Container, Heading, Tabs, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { sdk } from "../../lib/sdk"

// Sub-components
import { FranchisesTab } from "./_components/FranchisesTab"
import { LocationsTab } from "./_components/LocationsTab"
import { UsersTab } from "./_components/UsersTab"
import { FranchiseModal } from "./_components/FranchiseModal"
import { LocationModal } from "./_components/LocationModal"
import { LinkUserModal } from "./_components/LinkUserModal"
import { CreateUserModal } from "./_components/CreateUserModal"
import { LinkUserToStoreModal } from "./_components/LinkUserToStoreModal"
import { ResetPasswordModal } from "./_components/ResetPasswordModal"

// Types
import type { Franchise, StoreLocation, UserRecord } from "./_components/types"

// ---------------------------------------------------------------------------
// SuperAdminDashboard — orchestrator only.
// All rendering is delegated to sub-components.
// All state, queries, mutations, and handlers live here.
// ---------------------------------------------------------------------------

const SuperAdminDashboard = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("franchises")

  // ── Modal visibility ────────────────────────────────────────────────────────
  const [franchiseModalOpen, setFranchiseModalOpen] = useState(false)
  const [locationModalOpen, setLocationModalOpen] = useState(false)
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false)
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false)
  const [storeUserModalOpen, setStoreUserModalOpen] = useState(false)

  // ── Selection state ─────────────────────────────────────────────────────────
  const [selectedFranchise, setSelectedFranchise] = useState<Franchise | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<StoreLocation | null>(null)
  const [resetUser, setResetUser] = useState<UserRecord | null>(null)

  // ── Form: Franchise ─────────────────────────────────────────────────────────
  const [franName, setFranName] = useState("")
  const [franCode, setFranCode] = useState("")
  const [franActive, setFranActive] = useState(true)

  // ── Form: Location ──────────────────────────────────────────────────────────
  const [locName, setLocName] = useState("")
  const [locCode, setLocCode] = useState("")
  const [locFranId, setLocFranId] = useState("")
  const [locAddress, setLocAddress] = useState("")
  const [locLat, setLocLat] = useState("")
  const [locLng, setLocLng] = useState("")
  const [locActive, setLocActive] = useState(true)
  const [locAccepting, setLocAccepting] = useState(true)
  const [locLeadTime, setLocLeadTime] = useState("24")
  const [locCapacity, setLocCapacity] = useState("10")

  // ── Form: Link User ─────────────────────────────────────────────────────────
  const [linkUserId, setLinkUserId] = useState("")
  const [linkFranId, setLinkFranId] = useState("")

  // ── Form: Link User to Store ────────────────────────────────────────────
  const [storeUserLinkUserId, setStoreUserLinkUserId] = useState("")
  const [storeUserLinkStoreId, setStoreUserLinkStoreId] = useState("")

  // ── Queries ─────────────────────────────────────────────────────────────────
  // Current authenticated user — used to verify global super admin access.
  const { data: meData, isLoading: isLoadingMe } = useQuery({
    queryKey: ["super-admin-me"],
    queryFn: () =>
      sdk.client.fetch("/admin/users/me") as Promise<{ user: UserRecord }>,
  })
  const currentUserId = meData?.user?.id
  const isSuperAdmin = meData?.user?.metadata?.is_super_admin === true
  const isForbidden = meData && !isSuperAdmin

  useEffect(() => {
    if (meData && !isSuperAdmin) {
      navigate("/admin/franchise-dashboard")
    }
  }, [meData, isSuperAdmin, navigate])

  // Franchises are always fetched: they populate the tab table AND the
  // franchise selectors inside the Location and LinkUser modals.
  const { data: franchisesData, isLoading: isLoadingFranchises } = useQuery({
    queryKey: ["super-admin-franchises"],
    queryFn: () =>
      sdk.client.fetch("/admin/super-admin/franchises") as Promise<{ franchises: Franchise[] }>,
    enabled: isSuperAdmin,
  })

  // Locations and users are fetched lazily — only when the user navigates to
  // their respective tab, preventing unnecessary network calls on mount.
  const { data: locationsData, isLoading: isLoadingLocations } = useQuery({
    queryKey: ["super-admin-locations"],
    queryFn: () =>
      sdk.client.fetch("/admin/super-admin/locations") as Promise<{ locations: StoreLocation[] }>,
    enabled: isSuperAdmin && activeTab === "locations",
  })

  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["super-admin-users"],
    queryFn: () =>
      sdk.client.fetch("/admin/super-admin/users") as Promise<{ users: UserRecord[] }>,
    enabled: isSuperAdmin && activeTab === "users",
  })

  const franchises = franchisesData?.franchises || []
  const locations = locationsData?.locations || []
  const users = usersData?.users || []

  // ── Mutations ────────────────────────────────────────────────────────────────

  const franchiseMutation = useMutation({
    mutationFn: (payload: { id?: string; name: string; code: string; is_active: boolean }) => {
      if (payload.id) {
        return sdk.client.fetch(`/admin/super-admin/franchises/${payload.id}`, {
          method: "PATCH",
          body: { name: payload.name, code: payload.code, is_active: payload.is_active },
        })
      } else {
        return sdk.client.fetch("/admin/super-admin/franchises", {
          method: "POST",
          body: { name: payload.name, code: payload.code, is_active: payload.is_active },
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-franchises"] })
      setFranchiseModalOpen(false)
      setSelectedFranchise(null)
      toast.success("Success", { description: "Franchise saved successfully." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to save franchise." })
    },
  })

  const deleteFranchiseMutation = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/super-admin/franchises/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-franchises"] })
      queryClient.invalidateQueries({ queryKey: ["super-admin-locations"] })
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] })
      toast.success("Success", { description: "Franchise deleted successfully." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to delete franchise." })
    },
  })

  const locationMutation = useMutation({
    mutationFn: (payload: {
      id?: string
      name: string
      code: string
      franchise_id: string
      address: string
      latitude: number | null
      longitude: number | null
      is_active: boolean
      is_accepting_orders: boolean
      custom_lead_time_hours: number
      daily_order_capacity: number
    }) => {
      if (payload.id) {
        // franchise_id is immutable — strip it from the PATCH body
        const { id, franchise_id, ...updateFields } = payload
        return sdk.client.fetch(`/admin/super-admin/locations/${id}`, {
          method: "PATCH",
          body: updateFields,
        })
      } else {
        return sdk.client.fetch("/admin/super-admin/locations", {
          method: "POST",
          body: payload,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-locations"] })
      setLocationModalOpen(false)
      setSelectedLocation(null)
      toast.success("Success", { description: "Location saved successfully." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to save location." })
    },
  })

  const deleteLocationMutation = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/super-admin/locations/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-locations"] })
      toast.success("Success", { description: "Store location deleted successfully." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to delete location." })
    },
  })

  const linkUserMutation = useMutation({
    mutationFn: (payload: { user_id: string; franchise_id: string }) =>
      sdk.client.fetch("/admin/super-admin/users", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] })
      setUserModalOpen(false)
      toast.success("Success", { description: "User linked to franchise successfully." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to link user." })
    },
  })

  const unlinkUserMutation = useMutation({
    mutationFn: (payload: { user_id: string; franchise_id: string }) =>
      sdk.client.fetch(
        `/admin/super-admin/users?user_id=${payload.user_id}&franchise_id=${payload.franchise_id}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] })
      toast.success("Success", { description: "User unlinked from franchise successfully." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to unlink user." })
    },
  })

  const createUserMutation = useMutation({
    mutationFn: (payload: { email: string; password?: string; first_name?: string; last_name?: string; is_super_admin?: boolean }) =>
      sdk.client.fetch("/admin/super-admin/users/create", {
        method: "POST",
        body: payload,
      }) as Promise<{ user: UserRecord }>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] }).then(() => {
        setCreateUserModalOpen(false)
        const isSuper = data.user.metadata?.is_super_admin === true
        if (!isSuper) {
          setLinkUserId(data.user.id)
          setLinkFranId(franchises[0]?.id || "")
          setUserModalOpen(true)
        }
      })
      toast.success("Success", { description: "User account created successfully." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to create user." })
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) =>
      sdk.client.fetch(`/admin/super-admin/users/${id}/password`, {
        method: "PATCH",
        body: { password },
      }),
    onSuccess: () => {
      setResetPasswordModalOpen(false)
      setResetUser(null)
      toast.success("Success", { description: "Password reset successfully." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to reset password." })
    },
  })

  // ── Store-User Link Mutations ─────────────────────────────────────────────
  const linkUserToStoreMutation = useMutation({
    mutationFn: (payload: { user_id: string; store_location_id: string }) =>
      sdk.client.fetch("/admin/super-admin/store-user-links", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] })
      setStoreUserModalOpen(false)
      toast.success("Success", { description: "User assigned to store location." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to assign user to store." })
    },
  })

  const unlinkUserFromStoreMutation = useMutation({
    mutationFn: (payload: { user_id: string; store_location_id: string }) =>
      sdk.client.fetch(
        `/admin/super-admin/store-user-links?user_id=${payload.user_id}&store_location_id=${payload.store_location_id}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] })
      toast.success("Success", { description: "User removed from store location." })
    },
    onError: (err: any) => {
      toast.error("Error", { description: err.message || "Failed to remove user from store." })
    },
  })

  // ── Optimistic toggle: Franchise is_active ────────────────────────────────
  // Pattern: update cache immediately → PATCH → rollback on failure.
  const toggleFranchiseActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      sdk.client.fetch(`/admin/super-admin/franchises/${id}`, {
        method: "PATCH",
        body: { is_active },
      }),
    onMutate: async ({ id, is_active }) => {
      // Cancel any in-flight refetches so they don't overwrite the optimistic value
      await queryClient.cancelQueries({ queryKey: ["super-admin-franchises"] })
      const previous = queryClient.getQueryData<{ franchises: Franchise[] }>(["super-admin-franchises"])
      // Apply optimistic update to the cache
      queryClient.setQueryData<{ franchises: Franchise[] }>(["super-admin-franchises"], (old) => ({
        franchises: (old?.franchises ?? []).map((f) =>
          f.id === id ? { ...f, is_active } : f
        ),
      }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      // Rollback to the snapshot taken in onMutate
      if (context?.previous) {
        queryClient.setQueryData(["super-admin-franchises"], context.previous)
      }
      toast.error("Error", { description: "Failed to update franchise status. Reverting." })
    },
    onSettled: () => {
      // Always sync the server truth after the mutation settles
      queryClient.invalidateQueries({ queryKey: ["super-admin-franchises"] })
    },
  })

  // ── Optimistic toggle: Location is_active / is_accepting_orders / is_default
  const toggleLocationMutation = useMutation({
    mutationFn: ({
      id,
      field,
      value,
    }: {
      id: string
      field: "is_active" | "is_accepting_orders" | "is_default"
      value: boolean
    }) =>
      sdk.client.fetch(`/admin/super-admin/locations/${id}`, {
        method: "PATCH",
        body: { [field]: value },
      }),
    onMutate: async ({ id, field, value }) => {
      await queryClient.cancelQueries({ queryKey: ["super-admin-locations"] })
      const previous = queryClient.getQueryData<{ locations: StoreLocation[] }>(["super-admin-locations"])
      queryClient.setQueryData<{ locations: StoreLocation[] }>(["super-admin-locations"], (old) => {
        const locations = old?.locations ?? []
        // When promoting a default, demote every sibling in the same franchise
        // so the table matches the server invariant immediately.
        if (field === "is_default" && value === true) {
          const target = locations.find((l) => l.id === id)
          const franchiseId = target?.franchise?.id
          return {
            locations: locations.map((l) => {
              if (l.id === id) return { ...l, is_default: true }
              if (franchiseId && l.franchise?.id === franchiseId) {
                return { ...l, is_default: false }
              }
              return l
            }),
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
        queryClient.setQueryData(["super-admin-locations"], context.previous)
      }
      toast.error("Error", {
        description:
          err?.message || "Failed to update location status. Reverting.",
      })
    },
    onSuccess: (_data, vars) => {
      if (vars.field === "is_default" && vars.value) {
        toast.success("Default store updated", {
          description: "New storefront visitors will be pre-selected on this bakery.",
        })
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-locations"] })
    },
  })

  if (isLoadingMe) {
    return (
      <div className="flex h-screen items-center justify-center bg-ui-bg-subtle">
        <Text className="text-ui-fg-subtle animate-pulse">Loading authorization...</Text>
      </div>
    )
  }

  if (isForbidden) {
    return (
      <Container className="p-6 max-w-md mx-auto mt-20 flex flex-col items-center text-center gap-4">
        <Heading level="h1" className="text-red-600 flex items-center gap-2">
          <Wrench className="text-red-600 animate-bounce" />
          Access Denied
        </Heading>
        <Text className="text-ui-fg-subtle">
          This area is restricted to global administrators. Redirecting you to the Franchise Dashboard...
        </Text>
      </Container>
    )
  }

  // ── Form triggers ────────────────────────────────────────────────────────────

  const openAddFranchise = () => {
    setSelectedFranchise(null)
    setFranName("")
    setFranCode("")
    setFranActive(true)
    setFranchiseModalOpen(true)
  }

  const openEditFranchise = (fran: Franchise) => {
    setSelectedFranchise(fran)
    setFranName(fran.name)
    setFranCode(fran.code)
    setFranActive(fran.is_active)
    setFranchiseModalOpen(true)
  }

  const handleSaveFranchise = (e: React.FormEvent) => {
    e.preventDefault()
    if (!franName || !franCode) {
      toast.error("Validation Error", { description: "Name and Code are required." })
      return
    }
    franchiseMutation.mutate({
      id: selectedFranchise?.id,
      name: franName,
      code: franCode,
      is_active: franActive,
    })
  }

  const openAddLocation = () => {
    setSelectedLocation(null)
    setLocName("")
    setLocCode("")
    // Default to empty string — user must explicitly choose a franchise.
    // Auto-selecting franchises[0] caused silent wrong-franchise assignments.
    setLocFranId("")
    setLocAddress("")
    setLocLat("")
    setLocLng("")
    setLocActive(true)
    setLocAccepting(true)
    setLocLeadTime("24")
    setLocCapacity("10")
    setLocationModalOpen(true)
  }

  const openEditLocation = (loc: StoreLocation) => {
    setSelectedLocation(loc)
    setLocName(loc.name)
    setLocCode(loc.code)
    // NOTE: locFranId IS intentionally set here even though franchise_id is immutable.
    // The LocationModal shows the franchise dropdown in a DISABLED state in edit mode,
    // so the value is needed purely to display the current franchise name.
    // The locationMutation already strips franchise_id from the PATCH body, so it is
    // never sent to the backend during an update.
    setLocFranId(loc.franchise.id)
    setLocAddress(loc.address || "")
    setLocLat(loc.latitude !== null ? String(loc.latitude) : "")
    setLocLng(loc.longitude !== null ? String(loc.longitude) : "")
    setLocActive(loc.is_active)
    setLocAccepting(loc.is_accepting_orders)
    setLocLeadTime(String(loc.custom_lead_time_hours))
    setLocCapacity(String(loc.daily_order_capacity))
    setLocationModalOpen(true)
  }

  const handleSaveLocation = (e: React.FormEvent) => {
    e.preventDefault()
    if (!locName || !locCode || !locFranId) {
      toast.error("Validation Error", { description: "Name, Code, and Franchise are required." })
      return
    }
    locationMutation.mutate({
      id: selectedLocation?.id,
      name: locName,
      code: locCode,
      franchise_id: locFranId,
      address: locAddress,
      latitude: locLat ? parseFloat(locLat) : null,
      longitude: locLng ? parseFloat(locLng) : null,
      is_active: locActive,
      is_accepting_orders: locAccepting,
      custom_lead_time_hours: parseInt(locLeadTime) || 24,
      daily_order_capacity: parseInt(locCapacity) || 10,
    })
  }

  const handleDeleteLocation = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"? This will sever all linked stock connections.`)) {
      deleteLocationMutation.mutate(id)
    }
  }

  const openLinkUser = () => {
    setLinkUserId(users[0]?.id || "")
    setLinkFranId(franchises[0]?.id || "")
    setUserModalOpen(true)
  }

  const openCreateUser = () => {
    setCreateUserModalOpen(true)
  }

  const openResetPassword = (usr: UserRecord) => {
    setResetUser(usr)
    setResetPasswordModalOpen(true)
  }

  const handleCreateUser = (data: { email: string; password?: string; first_name?: string; last_name?: string; is_super_admin?: boolean }) => {
    createUserMutation.mutate(data)
  }

  const handleResetPassword = (password: string) => {
    if (!resetUser) return
    resetPasswordMutation.mutate({ id: resetUser.id, password })
  }

  const handleLinkUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkUserId || !linkFranId) {
      toast.error("Validation Error", { description: "User and Franchise are required." })
      return
    }
    linkUserMutation.mutate({ user_id: linkUserId, franchise_id: linkFranId })
  }

  const handleUnlinkUser = (userId: string, franchiseId: string) => {
    if (confirm("Are you sure you want to revoke this user's access to this franchise?")) {
      unlinkUserMutation.mutate({ user_id: userId, franchise_id: franchiseId })
    }
  }

  const openAssignUserToStore = () => {
    setStoreUserLinkUserId("")
    setStoreUserLinkStoreId("")
    setStoreUserModalOpen(true)
  }

  const handleLinkUserToStore = (e: React.FormEvent) => {
    e.preventDefault()
    if (!storeUserLinkUserId || !storeUserLinkStoreId) {
      toast.error("Validation Error", { description: "User and Store Location are required." })
      return
    }
    linkUserToStoreMutation.mutate({
      user_id: storeUserLinkUserId,
      store_location_id: storeUserLinkStoreId,
    })
  }

  const handleUnlinkUserFromStore = (userId: string, storeLocationId: string) => {
    if (confirm("Are you sure you want to remove this user's store assignment?")) {
      unlinkUserFromStoreMutation.mutate({ user_id: userId, store_location_id: storeLocationId })
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Container className="divide-y p-0">
      {/* Page Header */}
      <div className="flex flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Heading level="h1" className="flex items-center gap-2">
            <Wrench className="text-ui-fg-subtle" />
            Super Admin Portal
          </Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Global management portal for configuring system franchises, baking locations,
            and administrative access links.
          </Text>
        </div>
      </div>

      {/* Main Content Tabs */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List className="mb-6">
            <Tabs.Trigger value="franchises">Franchises</Tabs.Trigger>
            <Tabs.Trigger value="locations">Locations</Tabs.Trigger>
            <Tabs.Trigger value="users">User Access Mappings</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="franchises">
            <FranchisesTab
              franchises={franchises}
              isLoading={isLoadingFranchises}
              onAddFranchise={openAddFranchise}
              onEditFranchise={openEditFranchise}
              onToggleFranchiseActive={(id, value) =>
                toggleFranchiseActiveMutation.mutate({ id, is_active: value })
              }
              onDeleteFranchise={(id) =>
                deleteFranchiseMutation.mutate(id)
              }
            />
          </Tabs.Content>

          <Tabs.Content value="locations">
            <LocationsTab
              locations={locations}
              isLoading={isLoadingLocations}
              onAddLocation={openAddLocation}
              onEditLocation={openEditLocation}
              onDeleteLocation={handleDeleteLocation}
              onToggleLocation={(id, field, value) =>
                toggleLocationMutation.mutate({ id, field, value })
              }
            />
          </Tabs.Content>

          <Tabs.Content value="users">
            <UsersTab
              users={users}
              isLoading={isLoadingUsers}
              franchisesCount={franchises.length}
              currentUserId={currentUserId}
              onCreateUser={openCreateUser}
              onAssignUser={openLinkUser}
              onUnlinkUser={handleUnlinkUser}
              onResetPassword={openResetPassword}
              onAssignUserToStore={openAssignUserToStore}
              onUnlinkUserFromStore={handleUnlinkUserFromStore}
            />
          </Tabs.Content>
        </Tabs>
      </div>

      {/* Modals — rendered outside the tab tree so they are not unmounted on tab switch */}
      <FranchiseModal
        open={franchiseModalOpen}
        onOpenChange={setFranchiseModalOpen}
        selectedFranchise={selectedFranchise}
        franName={franName}
        franCode={franCode}
        franActive={franActive}
        onNameChange={setFranName}
        onCodeChange={setFranCode}
        onActiveChange={setFranActive}
        onSubmit={handleSaveFranchise}
        isPending={franchiseMutation.isPending}
      />

      <LocationModal
        open={locationModalOpen}
        onOpenChange={setLocationModalOpen}
        selectedLocation={selectedLocation}
        franchises={franchises}
        locName={locName}
        locCode={locCode}
        locFranId={locFranId}
        locAddress={locAddress}
        locLat={locLat}
        locLng={locLng}
        locActive={locActive}
        locAccepting={locAccepting}
        locLeadTime={locLeadTime}
        locCapacity={locCapacity}
        onNameChange={setLocName}
        onCodeChange={setLocCode}
        onFranIdChange={setLocFranId}
        onAddressChange={setLocAddress}
        onLatChange={setLocLat}
        onLngChange={setLocLng}
        onActiveChange={setLocActive}
        onAcceptingChange={setLocAccepting}
        onLeadTimeChange={setLocLeadTime}
        onCapacityChange={setLocCapacity}
        onSubmit={handleSaveLocation}
        isPending={locationMutation.isPending}
      />

      <LinkUserModal
        open={userModalOpen}
        onOpenChange={setUserModalOpen}
        users={users}
        franchises={franchises}
        linkUserId={linkUserId}
        linkFranId={linkFranId}
        onUserChange={setLinkUserId}
        onFranchiseChange={setLinkFranId}
        onSubmit={handleLinkUser}
        isPending={linkUserMutation.isPending}
        onCreateUserClick={() => {
          setUserModalOpen(false)
          setCreateUserModalOpen(true)
        }}
      />

      <CreateUserModal
        open={createUserModalOpen}
        onOpenChange={setCreateUserModalOpen}
        onSubmit={handleCreateUser}
        isPending={createUserMutation.isPending}
      />

      <ResetPasswordModal
        open={resetPasswordModalOpen}
        onOpenChange={setResetPasswordModalOpen}
        userEmail={resetUser?.email || ""}
        onSubmit={handleResetPassword}
        isPending={resetPasswordMutation.isPending}
      />

      <LinkUserToStoreModal
        open={storeUserModalOpen}
        onOpenChange={setStoreUserModalOpen}
        users={users}
        locations={locations}
        franchises={franchises}
        linkUserId={storeUserLinkUserId}
        linkStoreLocationId={storeUserLinkStoreId}
        onUserChange={setStoreUserLinkUserId}
        onStoreLocationChange={setStoreUserLinkStoreId}
        onSubmit={handleLinkUserToStore}
        isPending={linkUserToStoreMutation.isPending}
      />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Super Admin Portal",
  icon: Wrench,
  rank: 2,
})

export default SuperAdminDashboard
