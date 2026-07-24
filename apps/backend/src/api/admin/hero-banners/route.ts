/**
 * GET  /admin/hero-banners  — list hero slides (franchise-scoped + global)
 * POST /admin/hero-banners  — create a hero slide
 *
 * Super admins see and may create global (franchise_id null) or any franchise.
 * Franchise admins see their franchise rows + global defaults, but may only
 * create / mutate banners scoped to their franchise(s).
 */

import type { MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  isSuperAdminUser,
  resolveAdminFranchiseIds,
  type AuthenticatedTenantRequest,
} from "../../../utils/tenant-context"
import { CMS_MODULE } from "../../../modules/cms"

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
  createHero_banners: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<HeroBannerRow | HeroBannerRow[]>
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

const asOptionalString = (value: unknown, max = 500): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

const asRequiredString = (
  value: unknown,
  field: string,
  max = 500
): string => {
  const s = asOptionalString(value, max)
  if (!s) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${field} is required`
    )
  }
  return s
}

/**
 * Super admin → null (unrestricted list).
 * Franchise admin → allow-list of franchise ids.
 */
const resolveScope = async (
  req: AuthenticatedTenantRequest
): Promise<string[] | null> => {
  const isSA = await isSuperAdminUser(req)
  if (isSA) return null

  try {
    return await resolveAdminFranchiseIds(req)
  } catch (err) {
    if (
      err instanceof MedusaError &&
      err.type === MedusaError.Types.NOT_ALLOWED
    ) {
      // Unlinked non-SA admin — fail closed
      return []
    }
    throw err
  }
}

export const GET = async (
  req: AuthenticatedTenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const limit = Math.min(
    Math.max(parseInt(String(req.query?.limit ?? "100"), 10) || 100, 1),
    200
  )
  const offset = Math.max(
    parseInt(String(req.query?.offset ?? "0"), 10) || 0,
    0
  )

  const activeOnly =
    typeof req.query?.is_active === "string"
      ? req.query.is_active === "true"
      : undefined

  const scope = await resolveScope(req)

  if (scope !== null && !scope.length) {
    res.status(200).json({ hero_banners: [], count: 0, limit, offset })
    return
  }

  const cms = req.scope.resolve(CMS_MODULE) as CMSService

  const filters: Record<string, unknown> = {}
  if (activeOnly !== undefined) {
    filters.is_active = activeOnly
  }

  // Optional franchise filter from query (super admin / multi-franchise)
  const franchiseFilter =
    typeof req.query?.franchise_id === "string"
      ? req.query.franchise_id.trim()
      : ""

  const rows = await cms.listHero_banners(filters, {
    take: 500,
    skip: 0,
    order: { display_order: "ASC", created_at: "ASC" },
  })

  let scoped = rows
  if (scope !== null) {
    // Franchise admin: own franchise rows + global defaults
    scoped = rows.filter((row) => {
      const fid = row.franchise_id
      if (!fid) return true
      return scope.includes(fid)
    })
  }

  if (franchiseFilter === "global") {
    scoped = scoped.filter((r) => !r.franchise_id)
  } else if (franchiseFilter) {
    scoped = scoped.filter((r) => r.franchise_id === franchiseFilter)
  }

  const count = scoped.length
  const page = scoped.slice(offset, offset + limit)

  res.status(200).json({
    hero_banners: page.map(serializeBanner),
    count,
    limit,
    offset,
  })
}

export const POST = async (
  req: AuthenticatedTenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const isSA = await isSuperAdminUser(req)

  let allowedFranchiseIds: string[] | null = null
  if (!isSA) {
    try {
      allowedFranchiseIds = await resolveAdminFranchiseIds(req)
    } catch (err) {
      if (
        err instanceof MedusaError &&
        err.type === MedusaError.Types.NOT_ALLOWED
      ) {
        throw new MedusaError(
          MedusaError.Types.FORBIDDEN,
          "You are not authorized to create hero banners"
        )
      }
      throw err
    }
    if (!allowedFranchiseIds.length) {
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "No franchise context"
      )
    }
  }

  const tag = asRequiredString(body.tag, "tag", 80)
  const title = asRequiredString(body.title, "title", 200)
  const primary_cta_label = asRequiredString(
    body.primary_cta_label,
    "primary_cta_label",
    80
  )
  const primary_cta_href = asRequiredString(
    body.primary_cta_href,
    "primary_cta_href",
    500
  )
  const image_url = asRequiredString(body.image_url, "image_url", 2000)

  // Resolve franchise scope for the new row
  let franchiseId: string | null = null
  const bodyFranchise =
    body.franchise_id === null
      ? null
      : asOptionalString(body.franchise_id, 100)

  if (isSA) {
    // Super admin may create global (null) or any franchise-scoped banner
    franchiseId = bodyFranchise
  } else {
    // Franchise admin: force to their franchise (header preferred, else body, else first)
    const headerFid =
      typeof req.headers["x-franchise-id"] === "string"
        ? req.headers["x-franchise-id"].trim()
        : ""
    const preferred =
      (headerFid && allowedFranchiseIds!.includes(headerFid)
        ? headerFid
        : null) ||
      (bodyFranchise && allowedFranchiseIds!.includes(bodyFranchise)
        ? bodyFranchise
        : null) ||
      allowedFranchiseIds![0]
    franchiseId = preferred
  }

  const displayOrderRaw = body.display_order
  const display_order =
    typeof displayOrderRaw === "number" && Number.isFinite(displayOrderRaw)
      ? Math.max(0, Math.floor(displayOrderRaw))
      : typeof displayOrderRaw === "string" && displayOrderRaw.trim() !== ""
        ? Math.max(0, parseInt(displayOrderRaw, 10) || 0)
        : 0

  const is_active =
    typeof body.is_active === "boolean" ? body.is_active : true

  const cms = req.scope.resolve(CMS_MODULE) as CMSService

  const created = await cms.createHero_banners({
    tag,
    title,
    title_emphasis: asOptionalString(body.title_emphasis, 200),
    description: asOptionalString(body.description, 2000),
    primary_cta_label,
    primary_cta_href,
    secondary_cta_label: asOptionalString(body.secondary_cta_label, 80),
    secondary_cta_href: asOptionalString(body.secondary_cta_href, 500),
    image_url,
    image_alt: asOptionalString(body.image_alt, 200),
    display_order,
    is_active,
    franchise_id: franchiseId,
  })

  const row = Array.isArray(created) ? created[0] : created

  res.status(201).json({ hero_banner: serializeBanner(row) })
}
