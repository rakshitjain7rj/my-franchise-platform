/**
 * Hero Banners — CMS admin for the storefront home carousel.
 *
 * Data: GET/POST /admin/hero-banners, POST/DELETE /admin/hero-banners/:id
 * Images: POST /admin/uploads (Medusa File Module) or paste a public URL.
 */

import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArrowDownMini,
  ArrowPath,
  ArrowUpMini,
  Photo,
  Plus,
  Trash,
} from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  FocusModal,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { sdk, useFranchiseFetch } from "../../lib/sdk"
import { useFranchise } from "../../providers/FranchiseContext"
import {
  CardListSkeleton,
  EmptyState,
  FilterBar,
  FilterPills,
  FormField,
  PageHeader,
  SearchInput,
  StatusDot,
} from "../../components/ui"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HeroBanner = {
  id: string
  tag: string
  title: string
  title_emphasis: string | null
  description: string | null
  primary_cta_label: string
  primary_cta_href: string
  secondary_cta_label: string | null
  secondary_cta_href: string | null
  image_url: string
  image_alt: string | null
  display_order: number
  is_active: boolean
  franchise_id: string | null
  created_at: string
}

type BannersResponse = {
  hero_banners: HeroBanner[]
  count: number
  limit: number
  offset: number
}

type BannerForm = {
  tag: string
  title: string
  title_emphasis: string
  description: string
  primary_cta_label: string
  primary_cta_href: string
  secondary_cta_label: string
  secondary_cta_href: string
  image_url: string
  image_alt: string
  display_order: number
  is_active: boolean
  /** Empty string = global (super admin only when creating). */
  franchise_scope: "franchise" | "global"
}

type ScopeFilter = "all" | "active" | "inactive"

const EMPTY_FORM: BannerForm = {
  tag: "",
  title: "",
  title_emphasis: "",
  description: "",
  primary_cta_label: "Shop Now",
  primary_cta_href: "/cake-catalogue",
  secondary_cta_label: "",
  secondary_cta_href: "",
  image_url: "",
  image_alt: "",
  display_order: 0,
  is_active: true,
  franchise_scope: "franchise",
}

const SCOPE_OPTIONS: Array<{ value: ScopeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const bannerToForm = (b: HeroBanner): BannerForm => ({
  tag: b.tag,
  title: b.title,
  title_emphasis: b.title_emphasis ?? "",
  description: b.description ?? "",
  primary_cta_label: b.primary_cta_label,
  primary_cta_href: b.primary_cta_href,
  secondary_cta_label: b.secondary_cta_label ?? "",
  secondary_cta_href: b.secondary_cta_href ?? "",
  image_url: b.image_url,
  image_alt: b.image_alt ?? "",
  display_order: b.display_order,
  is_active: b.is_active,
  franchise_scope: b.franchise_id ? "franchise" : "global",
})

const formToPayload = (
  form: BannerForm,
  opts: { isCreate: boolean; isSuperAdmin: boolean; activeFranchiseId: string | null }
) => {
  const payload: Record<string, unknown> = {
    tag: form.tag.trim(),
    title: form.title.trim(),
    title_emphasis: form.title_emphasis.trim() || null,
    description: form.description.trim() || null,
    primary_cta_label: form.primary_cta_label.trim(),
    primary_cta_href: form.primary_cta_href.trim(),
    secondary_cta_label: form.secondary_cta_label.trim() || null,
    secondary_cta_href: form.secondary_cta_href.trim() || null,
    image_url: form.image_url.trim(),
    image_alt: form.image_alt.trim() || null,
    display_order: form.display_order,
    is_active: form.is_active,
  }

  if (opts.isSuperAdmin) {
    if (form.franchise_scope === "global") {
      payload.franchise_id = null
    } else if (opts.activeFranchiseId) {
      payload.franchise_id = opts.activeFranchiseId
    }
  }

  return payload
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const HeroBannersPage = () => {
  const queryClient = useQueryClient()
  const franchiseFetch = useFranchiseFetch()
  const { activeFranchiseId } = useFranchise()

  const [scope, setScope] = useState<ScopeFilter>("all")
  const [search, setSearch] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<HeroBanner | null>(null)
  const [form, setForm] = useState<BannerForm>(EMPTY_FORM)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: meData } = useQuery({
    queryKey: ["admin-user-me-hero-banners"],
    queryFn: () =>
      sdk.client.fetch<{ user: { metadata?: { is_super_admin?: boolean } } }>(
        "/admin/users/me"
      ),
  })
  const isSuperAdmin = meData?.user?.metadata?.is_super_admin === true

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["admin-hero-banners", activeFranchiseId],
    queryFn: () =>
      franchiseFetch<BannersResponse>("/admin/hero-banners", {
        query: { limit: 200 },
      }),
  })

  const banners = useMemo(() => {
    let rows = data?.hero_banners ?? []
    if (scope === "active") rows = rows.filter((b) => b.is_active)
    if (scope === "inactive") rows = rows.filter((b) => !b.is_active)

    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((b) =>
        [b.tag, b.title, b.title_emphasis ?? "", b.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
    }
    return rows
  }, [data?.hero_banners, scope, search])

  const openCreate = () => {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      franchise_scope: activeFranchiseId ? "franchise" : "global",
      display_order: (data?.hero_banners?.length ?? 0) * 10,
    })
    setModalOpen(true)
  }

  const openEdit = (banner: HeroBanner) => {
    setEditing(banner)
    setForm(bannerToForm(banner))
    setModalOpen(true)
  }

  const setField = <K extends keyof BannerForm>(key: K, value: BannerForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = formToPayload(form, {
        isCreate: !editing,
        isSuperAdmin: Boolean(isSuperAdmin),
        activeFranchiseId,
      })

      if (!payload.tag || !payload.title || !payload.image_url) {
        throw new Error("Tag, title, and image are required")
      }
      if (!payload.primary_cta_label || !payload.primary_cta_href) {
        throw new Error("Primary CTA label and link are required")
      }

      if (editing) {
        return franchiseFetch(`/admin/hero-banners/${editing.id}`, {
          method: "POST",
          body: payload,
        })
      }
      return franchiseFetch("/admin/hero-banners", {
        method: "POST",
        body: payload,
      })
    },
    onSuccess: () => {
      toast.success(editing ? "Banner updated" : "Banner created")
      setModalOpen(false)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ["admin-hero-banners"] })
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not save banner")
    },
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) =>
      franchiseFetch(`/admin/hero-banners/${id}`, {
        method: "POST",
        body: { is_active },
      }),
    onSuccess: (_d, vars) => {
      toast.success(vars.is_active ? "Banner activated" : "Banner deactivated")
      queryClient.invalidateQueries({ queryKey: ["admin-hero-banners"] })
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update banner")
    },
  })

  const reorder = useMutation({
    mutationFn: async ({ id, display_order }: { id: string; display_order: number }) =>
      franchiseFetch(`/admin/hero-banners/${id}`, {
        method: "POST",
        body: { display_order },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-hero-banners"] })
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not reorder banner")
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) =>
      franchiseFetch(`/admin/hero-banners/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Banner deleted")
      queryClient.invalidateQueries({ queryKey: ["admin-hero-banners"] })
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not delete banner")
    },
  })

  const sortedAll = useMemo(
    () =>
      [...(data?.hero_banners ?? [])].sort(
        (a, b) => a.display_order - b.display_order || a.created_at.localeCompare(b.created_at)
      ),
    [data?.hero_banners]
  )

  const moveBanner = (banner: HeroBanner, direction: "up" | "down") => {
    const idx = sortedAll.findIndex((b) => b.id === banner.id)
    if (idx < 0) return
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sortedAll.length) return

    const other = sortedAll[swapIdx]
    // Swap display_order values (stable when orders collide: nudge by ±1)
    const aOrder = banner.display_order
    const bOrder = other.display_order
    const nextA = aOrder === bOrder ? aOrder + (direction === "up" ? -1 : 1) : bOrder
    const nextB = aOrder === bOrder ? bOrder + (direction === "up" ? 1 : -1) : aOrder
    void reorder.mutateAsync({ id: banner.id, display_order: Math.max(0, nextA) })
    void reorder.mutateAsync({ id: other.id, display_order: Math.max(0, nextB) })
  }

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPEG, PNG, WebP, or GIF)")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or smaller")
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("files", file)

      // Use raw fetch so FormData sets the multipart boundary correctly.
      // Session cookie auth is same-origin for Medusa Admin.
      const base =
        (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, "") ||
        ""
      const res = await fetch(`${base}/admin/uploads`, {
        method: "POST",
        body: formData,
        credentials: "include",
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(
          (errBody as { message?: string })?.message ||
            `Upload failed (${res.status})`
        )
      }

      const json = (await res.json()) as {
        files?: Array<{ url?: string }>
      }
      const url = json.files?.[0]?.url
      if (!url) throw new Error("Upload succeeded but no URL was returned")

      setField("image_url", url)
      if (!form.image_alt) {
        setField("image_alt", file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "))
      }
      toast.success("Image uploaded")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // Reset form when modal closes to avoid stale state flashes
  useEffect(() => {
    if (!modalOpen) {
      setEditing(null)
    }
  }, [modalOpen])

  const isSearching = search.trim().length > 0
  const canMutateGlobal = Boolean(isSuperAdmin)

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="divide-y p-0">
        <PageHeader
          title="Hero Banners"
          description="Manage home-page carousel slides. Franchise-specific banners override global defaults on the storefront."
          actions={
            <>
              <Badge size="2xsmall" color="grey">
                {data?.count ?? 0} total
              </Badge>
              <Button
                variant="secondary"
                size="small"
                onClick={() => refetch()}
                isLoading={isFetching}
              >
                <ArrowPath />
                Refresh
              </Button>
              <Button size="small" onClick={openCreate}>
                <Plus />
                Add banner
              </Button>
            </>
          }
        />

        <FilterBar ariaLabel="Filter hero banners">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search tag, title…"
            ariaLabel="Search hero banners"
            className="w-full sm:w-72"
          />
          <FilterPills<ScopeFilter>
            options={SCOPE_OPTIONS}
            value={scope}
            onChange={setScope}
            ariaLabel="Filter by active state"
          />
        </FilterBar>
      </Container>

      {isLoading ? (
        <CardListSkeleton cards={3} />
      ) : isError ? (
        <Container className="p-6">
          <EmptyState
            icon={<Photo />}
            title="Could not load hero banners"
            description="Check that you are logged in and try again."
            primaryAction={{
              label: "Retry",
              onClick: () => {
                void refetch()
              },
              isLoading: isFetching,
            }}
          />
        </Container>
      ) : banners.length === 0 ? (
        <Container className="p-6">
          <EmptyState
            icon={<Photo />}
            title={
              isSearching
                ? "No banners match your search"
                : scope !== "all"
                  ? `No ${scope} banners`
                  : "No hero banners yet"
            }
            description={
              isSearching
                ? `Nothing found for “${search.trim()}”.`
                : "Create a slide with custom copy, CTAs, and an image. Storefront falls back to built-in defaults until you add at least one active banner."
            }
            primaryAction={
              !isSearching
                ? { label: "Add banner", onClick: openCreate }
                : undefined
            }
            secondaryAction={
              isSearching
                ? { label: "Clear search", onClick: () => setSearch("") }
                : undefined
            }
          />
        </Container>
      ) : (
        <div className="flex flex-col gap-3">
          {banners.map((banner) => {
            const isGlobal = !banner.franchise_id
            const canEdit = !isGlobal || canMutateGlobal
            const fullIdx = sortedAll.findIndex((b) => b.id === banner.id)
            const canMoveUp = fullIdx > 0
            const canMoveDown = fullIdx >= 0 && fullIdx < sortedAll.length - 1

            return (
              <Container key={banner.id} className="p-0 overflow-hidden">
                <div className="flex flex-col sm:flex-row gap-0">
                  {/* Thumbnail */}
                  <div className="sm:w-48 h-36 sm:h-auto shrink-0 bg-ui-bg-subtle relative">
                    <img
                      src={banner.image_url}
                      alt={banner.image_alt || banner.title}
                      className="w-full h-full object-cover min-h-[9rem]"
                    />
                  </div>

                  <div className="flex-1 p-4 flex flex-col gap-3 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge size="2xsmall" color="purple">
                            {banner.tag}
                          </Badge>
                          <Badge
                            size="2xsmall"
                            color={isGlobal ? "blue" : "green"}
                          >
                            {isGlobal ? "Global" : "Franchise"}
                          </Badge>
                          <span className="inline-flex items-center gap-1.5">
                            <StatusDot
                              tone={banner.is_active ? "green" : "grey"}
                              ariaLabel={banner.is_active ? "Active" : "Inactive"}
                            />
                            <Text size="xsmall" className="text-ui-fg-subtle">
                              {banner.is_active ? "Active" : "Inactive"}
                            </Text>
                          </span>
                          <Text size="xsmall" className="text-ui-fg-muted">
                            Order {banner.display_order}
                          </Text>
                        </div>
                        <Heading level="h2" className="text-base truncate">
                          {banner.title}
                          {banner.title_emphasis ? (
                            <span className="text-ui-fg-subtle font-normal italic">
                              {" "}
                              {banner.title_emphasis}
                            </span>
                          ) : null}
                        </Heading>
                        {banner.description ? (
                          <Text
                            size="small"
                            className="text-ui-fg-subtle line-clamp-2"
                          >
                            {banner.description}
                          </Text>
                        ) : null}
                        <Text size="xsmall" className="text-ui-fg-muted">
                          CTA: {banner.primary_cta_label} → {banner.primary_cta_href}
                        </Text>
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={banner.is_active}
                            onCheckedChange={(checked) =>
                              toggleActive.mutate({
                                id: banner.id,
                                is_active: checked,
                              })
                            }
                            disabled={toggleActive.isPending}
                            aria-label={
                              banner.is_active
                                ? "Deactivate banner"
                                : "Activate banner"
                            }
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-ui-border-base">
                      {canEdit && (
                        <>
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => moveBanner(banner, "up")}
                            disabled={!canMoveUp || reorder.isPending}
                            aria-label="Move up"
                          >
                            <ArrowUpMini />
                          </Button>
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => moveBanner(banner, "down")}
                            disabled={!canMoveDown || reorder.isPending}
                            aria-label="Move down"
                          >
                            <ArrowDownMini />
                          </Button>
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => openEdit(banner)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="small"
                            variant="danger"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete “${banner.title}”? This cannot be undone.`
                                )
                              ) {
                                remove.mutate(banner.id)
                              }
                            }}
                            isLoading={
                              remove.isPending && remove.variables === banner.id
                            }
                          >
                            <Trash />
                            Delete
                          </Button>
                        </>
                      )}
                      {!canEdit && (
                        <Text size="xsmall" className="text-ui-fg-muted">
                          Global banner — super admin only
                        </Text>
                      )}
                    </div>
                  </div>
                </div>
              </Container>
            )
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      <FocusModal open={modalOpen} onOpenChange={setModalOpen}>
        <FocusModal.Content>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveMutation.mutate()
            }}
          >
            <FocusModal.Header>
              <FocusModal.Title asChild>
                <Heading level="h2">
                  {editing ? "Edit hero banner" : "Create hero banner"}
                </Heading>
              </FocusModal.Title>
            </FocusModal.Header>

            <FocusModal.Body className="flex flex-col gap-5 max-w-xl mx-auto py-8 px-1 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField id="hb-tag" label="Tag / Badge" required>
                  <Input
                    id="hb-tag"
                    value={form.tag}
                    onChange={(e) => setField("tag", e.target.value)}
                    placeholder="Seasonal Special"
                    autoComplete="off"
                  />
                </FormField>
                <FormField id="hb-order" label="Display order" helper="Lower numbers appear first">
                  <Input
                    id="hb-order"
                    type="number"
                    min={0}
                    value={form.display_order}
                    onChange={(e) =>
                      setField("display_order", parseInt(e.target.value, 10) || 0)
                    }
                  />
                </FormField>
              </div>

              <FormField id="hb-title" label="Title" required>
                <Input
                  id="hb-title"
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder="Summer"
                  autoComplete="off"
                />
              </FormField>

              <FormField
                id="hb-emphasis"
                label="Title emphasis"
                helper="Optional italic second line"
              >
                <Input
                  id="hb-emphasis"
                  value={form.title_emphasis}
                  onChange={(e) => setField("title_emphasis", e.target.value)}
                  placeholder="Harvest"
                  autoComplete="off"
                />
              </FormField>

              <FormField id="hb-desc" label="Description">
                <Textarea
                  id="hb-desc"
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  placeholder="Short supporting copy for the slide…"
                  rows={3}
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField id="hb-cta-label" label="Primary CTA label" required>
                  <Input
                    id="hb-cta-label"
                    value={form.primary_cta_label}
                    onChange={(e) => setField("primary_cta_label", e.target.value)}
                    placeholder="Pre-Order Now"
                  />
                </FormField>
                <FormField id="hb-cta-href" label="Primary CTA link" required>
                  <Input
                    id="hb-cta-href"
                    value={form.primary_cta_href}
                    onChange={(e) => setField("primary_cta_href", e.target.value)}
                    placeholder="/cake-catalogue"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField id="hb-cta2-label" label="Secondary CTA label">
                  <Input
                    id="hb-cta2-label"
                    value={form.secondary_cta_label}
                    onChange={(e) =>
                      setField("secondary_cta_label", e.target.value)
                    }
                    placeholder="Seasonal Menu"
                  />
                </FormField>
                <FormField id="hb-cta2-href" label="Secondary CTA link">
                  <Input
                    id="hb-cta2-href"
                    value={form.secondary_cta_href}
                    onChange={(e) =>
                      setField("secondary_cta_href", e.target.value)
                    }
                    placeholder="/cake-catalogue"
                  />
                </FormField>
              </div>

              <FormField
                id="hb-image"
                label="Image"
                required
                helper="Upload an image or paste a public URL"
              >
                <div className="flex flex-col gap-3">
                  {form.image_url ? (
                    <div className="rounded-lg overflow-hidden border border-ui-border-base h-36 bg-ui-bg-subtle">
                      <img
                        src={form.image_url}
                        alt={form.image_alt || "Banner preview"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : null}
                  <Input
                    id="hb-image"
                    value={form.image_url}
                    onChange={(e) => setField("image_url", e.target.value)}
                    placeholder="https://… or upload below"
                    autoComplete="off"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void uploadImage(file)
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="small"
                      isLoading={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Upload image
                    </Button>
                  </div>
                </div>
              </FormField>

              <FormField id="hb-alt" label="Image alt text">
                <Input
                  id="hb-alt"
                  value={form.image_alt}
                  onChange={(e) => setField("image_alt", e.target.value)}
                  placeholder="Descriptive alt for accessibility"
                />
              </FormField>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-ui-border-base px-4 py-3">
                <div className="min-w-0">
                  <Label htmlFor="hb-active">Active</Label>
                  <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
                    Only active banners appear on the storefront.
                  </Text>
                </div>
                <Switch
                  id="hb-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setField("is_active", v)}
                  className="shrink-0"
                />
              </div>

              {isSuperAdmin && (
                <div className="flex items-center justify-between gap-4 rounded-lg border border-ui-border-base px-4 py-3">
                  <div className="min-w-0">
                    <Label htmlFor="hb-global">Global default</Label>
                    <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
                      Global banners show when a franchise has no overrides.
                      {activeFranchiseId
                        ? " Uncheck to scope to the active franchise."
                        : " No franchise selected — will save as global."}
                    </Text>
                  </div>
                  <Switch
                    id="hb-global"
                    checked={form.franchise_scope === "global"}
                    onCheckedChange={(v) =>
                      setField("franchise_scope", v ? "global" : "franchise")
                    }
                    className="shrink-0"
                  />
                </div>
              )}
            </FocusModal.Body>

            <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={saveMutation.isPending}
                disabled={
                  !form.tag.trim() ||
                  !form.title.trim() ||
                  !form.image_url.trim() ||
                  !form.primary_cta_label.trim() ||
                  !form.primary_cta_href.trim()
                }
              >
                {editing ? "Save changes" : "Create banner"}
              </Button>
            </div>
          </form>
        </FocusModal.Content>
      </FocusModal>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Hero Banners",
  icon: Photo,
})

export default HeroBannersPage
