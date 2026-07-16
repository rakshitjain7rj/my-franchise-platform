/**
 * GET /admin/leads
 *
 * List inbound Contact Us + Apply Franchise submissions for bakery ops.
 *
 * Super admins see every lead. Franchise admins see leads tagged to their
 * franchise(s) plus unscoped leads (franchise_id null) — form visitors often
 * have no franchise cookie yet.
 *
 * Query params:
 *   - status : new | contacted | closed | all  (default: new)
 *   - type   : contact | franchise | all       (default: all)
 *   - limit / offset
 */

import type { MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  type AuthenticatedTenantRequest,
} from "../../../utils/tenant-context"
import { INBOUND_LEAD_MODULE } from "../../../modules/inbound_lead"

type LeadStatus = "new" | "contacted" | "closed"
type LeadType = "contact" | "franchise"

type InboundLeadRow = {
  id: string
  type: LeadType
  name: string
  email: string
  phone: string | null
  message: string | null
  metadata: Record<string, unknown> | null
  franchise_id: string | null
  status: LeadStatus
  created_at: string | Date
  updated_at?: string | Date
}

type LeadService = {
  listInbound_leads: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<InboundLeadRow[]>
}

const VALID_STATUSES = new Set<LeadStatus | "all">([
  "new",
  "contacted",
  "closed",
  "all",
])
const VALID_TYPES = new Set<LeadType | "all">(["contact", "franchise", "all"])

/**
 * Super admin → null (unrestricted).
 * Franchise admin → allow-list of franchise ids (may be empty → no scoped leads).
 */
const resolveScope = async (
  req: AuthenticatedTenantRequest
): Promise<string[] | null> => {
  try {
    return await resolveAdminFranchiseIds(req)
  } catch (err) {
    if (
      err instanceof MedusaError &&
      err.type === MedusaError.Types.NOT_ALLOWED
    ) {
      return null
    }
    throw err
  }
}

const serializeLead = (row: InboundLeadRow) => ({
  id: row.id,
  type: row.type,
  name: row.name,
  email: row.email,
  phone: row.phone ?? null,
  message: row.message ?? null,
  metadata:
    row.metadata && typeof row.metadata === "object" ? row.metadata : null,
  franchise_id: row.franchise_id ?? null,
  status: row.status,
  created_at:
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
})

export const GET = async (
  req: AuthenticatedTenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const statusParam =
    typeof req.query?.status === "string" ? req.query.status : "new"
  const status = (
    VALID_STATUSES.has(statusParam as LeadStatus | "all")
      ? statusParam
      : "new"
  ) as LeadStatus | "all"

  const typeParam =
    typeof req.query?.type === "string" ? req.query.type : "all"
  const type = (
    VALID_TYPES.has(typeParam as LeadType | "all") ? typeParam : "all"
  ) as LeadType | "all"

  const limit = Math.min(
    Math.max(parseInt(String(req.query?.limit ?? "50"), 10) || 50, 1),
    200
  )
  const offset = Math.max(
    parseInt(String(req.query?.offset ?? "0"), 10) || 0,
    0
  )

  const allowedFranchiseIds = await resolveScope(req)

  // Franchise admin with zero franchise links → fail closed (no rows)
  if (allowedFranchiseIds !== null && !allowedFranchiseIds.length) {
    res.status(200).json({ leads: [], count: 0, limit, offset })
    return
  }

  const leadService = req.scope.resolve(INBOUND_LEAD_MODULE) as LeadService

  const filters: Record<string, unknown> = {}
  if (status !== "all") {
    filters.status = status
  }
  if (type !== "all") {
    filters.type = type
  }

  // Fetch a wider window so we can apply franchise scoping + pagination.
  // Lead volume is ops inbox scale, not catalogue scale.
  const rows = await leadService.listInbound_leads(filters, {
    take: 500,
    skip: 0,
    order: { created_at: "DESC" },
  })

  const scoped =
    allowedFranchiseIds === null
      ? rows
      : rows.filter((row) => {
          const fid = row.franchise_id
          // Unscoped form submissions (no cookie) are visible to franchise ops
          if (!fid) return true
          return allowedFranchiseIds.includes(fid)
        })

  const count = scoped.length
  const page = scoped.slice(offset, offset + limit)

  res.status(200).json({
    leads: page.map(serializeLead),
    count,
    limit,
    offset,
  })
}
