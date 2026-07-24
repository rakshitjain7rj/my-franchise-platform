/**
 * GET    /admin/hero-banners/:id  — single banner
 * POST   /admin/hero-banners/:id  — update banner (Medusa admin convention)
 * DELETE /admin/hero-banners/:id  — soft-delete banner
 *
 * Franchise admins may only mutate banners scoped to their franchise(s).
 * Global (franchise_id null) banners are super-admin only for mutations.
 */

import type { MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  isSuperAdminUser,
  resolveAdminFranchiseIds,
  type AuthenticatedTenantRequest,
} from "../../../../utils/tenant-context"
import { CMS_MODULE } from "../../../../modules/cms"

type HeroBannerRow = {
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
  created_at: string | Date
  updated_at?: string | Date
}

type CMSService = {
  listHero_banners: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<HeroBannerRow[]>
  updateHero_banners: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<HeroBannerRow | HeroBannerRow[]>
  deleteHero_banners: (ids: string | string[]) => Promise<void>
}

const serializeBanner = (row: HeroBannerRow) => ({
  id: row.id,
  tag: row.tag,
  title: row.title,
  title_emphasis: row.title_emphasis ?? null,
  description: row.description ?? null,
  primary_cta_label: row.primary_cta_label,
  primary_cta_href: row.primary_cta_href,
  secondary_cta_label: row.secondary_cta_label ?? null,
  secondary_cta_href: row.secondary_cta_href ?? null,
  image_url: row.image_url,
  image_alt: row.image_alt ?? null,
  display_order: Number(row.display_order ?? 0),
  is_active: Boolean(row.is_active),
  franchise_id: row.franchise_id ?? null,
  created_at:
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
})

const asOptionalString = (value: unknown, max = 500): string | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

const loadBanner = async (
  cms: CMSService,
  id: string
): Promise<HeroBannerRow> => {
  const [existing] = await cms.listHero_banners({ id }, { take: 1 })
  if (!existing) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Hero banner not found")
  }
  return existing
}

/**
 * Franchise admins may read own + global; mutate only own.
 * Super admins may do everything.
 */
const assertCanAccess = async (
  req: AuthenticatedTenantRequest,
  banner: HeroBannerRow,
  mutate: boolean
): Promise<void> => {
  const isSA = await isSuperAdminUser(req)
  if (isSA) return

  let allowed: string[]
  try {
    allowed = await resolveAdminFranchiseIds(req)
  } catch (err) {
    if (
      err instanceof MedusaError &&
      err.type === MedusaError.Types.NOT_ALLOWED
    ) {
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "You are not authorized to access this hero banner"
      )
    }
    throw err
  }

  if (!allowed.length) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "No franchise context"
    )
  }

  const fid = banner.franchise_id

  if (mutate) {
    // Global banners are super-admin only for writes
    if (!fid || !allowed.includes(fid)) {
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "You are not authorized to modify this hero banner"
      )
    }
    return
  }

  // Read: own franchise or global
  if (fid && !allowed.includes(fid)) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "You are not authorized to view this hero banner"
    )
  }
}

export const GET = async (
  req: AuthenticatedTenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const id = req.params?.id
  if (!id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Hero banner id is required"
    )
  }

  const cms = req.scope.resolve(CMS_MODULE) as CMSService
  const existing = await loadBanner(cms, id)
  await assertCanAccess(req, existing, false)

  res.status(200).json({ hero_banner: serializeBanner(existing) })
}

export const POST = async (
  req: AuthenticatedTenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const id = req.params?.id
  if (!id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Hero banner id is required"
    )
  }

  const cms = req.scope.resolve(CMS_MODULE) as CMSService
  const existing = await loadBanner(cms, id)
  await assertCanAccess(req, existing, true)

  const body = (req.body ?? {}) as Record<string, unknown>
  const isSA = await isSuperAdminUser(req)

  const patch: Record<string, unknown> = { id }

  const stringFields = [
    "tag",
    "title",
    "title_emphasis",
    "description",
    "primary_cta_label",
    "primary_cta_href",
    "secondary_cta_label",
    "secondary_cta_href",
    "image_url",
    "image_alt",
  ] as const

  for (const field of stringFields) {
    if (!(field in body)) continue
    const max =
      field === "description" || field === "image_url"
        ? 2000
        : field === "title" || field === "title_emphasis" || field === "image_alt"
          ? 200
          : field.includes("href")
            ? 500
            : 80
    const value = asOptionalString(body[field], max)
    if (value === undefined) continue

    // Required fields cannot be cleared to null
    if (
      value === null &&
      (field === "tag" ||
        field === "title" ||
        field === "primary_cta_label" ||
        field === "primary_cta_href" ||
        field === "image_url")
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `${field} cannot be empty`
      )
    }
    patch[field] = value
  }

  if ("display_order" in body) {
    const raw = body.display_order
    if (typeof raw === "number" && Number.isFinite(raw)) {
      patch.display_order = Math.max(0, Math.floor(raw))
    } else if (typeof raw === "string" && raw.trim() !== "") {
      patch.display_order = Math.max(0, parseInt(raw, 10) || 0)
    }
  }

  if (typeof body.is_active === "boolean") {
    patch.is_active = body.is_active
  }

  // Only super admin may re-scope franchise_id
  if (isSA && "franchise_id" in body) {
    if (body.franchise_id === null || body.franchise_id === "") {
      patch.franchise_id = null
    } else if (typeof body.franchise_id === "string") {
      patch.franchise_id = body.franchise_id.trim() || null
    }
  }

  const updated = await cms.updateHero_banners(patch)
  const row = Array.isArray(updated) ? updated[0] : updated

  res.status(200).json({ hero_banner: serializeBanner(row) })
}

export const DELETE = async (
  req: AuthenticatedTenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const id = req.params?.id
  if (!id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Hero banner id is required"
    )
  }

  const cms = req.scope.resolve(CMS_MODULE) as CMSService
  const existing = await loadBanner(cms, id)
  await assertCanAccess(req, existing, true)

  await cms.deleteHero_banners(id)

  res.status(200).json({
    id,
    object: "hero_banner",
    deleted: true,
  })
}
