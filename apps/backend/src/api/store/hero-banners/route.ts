/**
 * GET /store/hero-banners
 *
 * Active hero carousel slides for the storefront home page.
 *
 * Resolution order:
 *   1. Active banners where franchise_id = x-franchise-id (if header present)
 *   2. Else active global banners (franchise_id IS NULL)
 *
 * Ordered by display_order ASC, then created_at ASC.
 *
 * Franchise header is optional so cold visitors still see global defaults.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CMS_MODULE } from "../../../modules/cms"

export type HeroBannerRow = {
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
  created_at?: string | Date
}

type CMSService = {
  listHero_banners: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<HeroBannerRow[]>
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
  franchise_id: row.franchise_id ?? null,
})

/**
 * List active banners, then scope in memory.
 * Null franchise_id filters are unreliable across MikroORM operators, and
 * carousel volume is tiny (dozens of rows at most).
 */
const listActiveBanners = async (
  service: CMSService
): Promise<HeroBannerRow[]> => {
  return service.listHero_banners(
    { is_active: true },
    {
      take: 100,
      skip: 0,
      order: { display_order: "ASC", created_at: "ASC" },
    }
  )
}

const forFranchise = (
  rows: HeroBannerRow[],
  franchiseId: string
): HeroBannerRow[] => rows.filter((r) => r.franchise_id === franchiseId)

const forGlobal = (rows: HeroBannerRow[]): HeroBannerRow[] =>
  rows.filter((r) => !r.franchise_id)

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> => {
  const franchiseId =
    (typeof req.headers["x-franchise-id"] === "string"
      ? req.headers["x-franchise-id"].trim()
      : "") ||
    (typeof req.franchise_id === "string" ? req.franchise_id.trim() : "") ||
    null

  const cms = req.scope.resolve(CMS_MODULE) as CMSService
  const active = await listActiveBanners(cms)

  let rows: HeroBannerRow[] = []

  if (franchiseId) {
    rows = forFranchise(active, franchiseId)
  }

  // Franchise-specific miss (or no franchise header) → global defaults
  if (!rows.length) {
    rows = forGlobal(active)
  }

  res.status(200).json({
    hero_banners: rows.map(serializeBanner),
    count: rows.length,
  })
}
