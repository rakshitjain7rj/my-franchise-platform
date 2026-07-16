/**
 * POST /admin/leads/:id
 *
 * Update lead status for ops follow-up.
 * Body: { status: "new" | "contacted" | "closed" }
 *
 * Super admins may update any lead. Franchise admins may update leads scoped
 * to their franchise(s) or unscoped (franchise_id null) leads.
 */

import type { MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  type AuthenticatedTenantRequest,
} from "../../../../utils/tenant-context"
import { INBOUND_LEAD_MODULE } from "../../../../modules/inbound_lead"

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
}

type LeadService = {
  listInbound_leads: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<InboundLeadRow[]>
  updateInbound_leads: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<InboundLeadRow | InboundLeadRow[]>
}

const VALID_STATUSES = new Set<LeadStatus>(["new", "contacted", "closed"])

const assertCanUpdate = async (
  req: AuthenticatedTenantRequest,
  lead: InboundLeadRow
): Promise<void> => {
  try {
    const franchiseIds = await resolveAdminFranchiseIds(req)
    if (!franchiseIds.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "No franchise context"
      )
    }
    const fid = lead.franchise_id
    if (fid && !franchiseIds.includes(fid)) {
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "You are not authorized to update this lead"
      )
    }
  } catch (err) {
    if (
      err instanceof MedusaError &&
      err.type === MedusaError.Types.NOT_ALLOWED
    ) {
      // Super admin
      return
    }
    throw err
  }
}

export const POST = async (
  req: AuthenticatedTenantRequest,
  res: MedusaResponse
): Promise<void> => {
  const leadId = req.params?.id
  if (!leadId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Lead id is required"
    )
  }

  const body = (req.body ?? {}) as { status?: string }
  const nextStatus = body.status

  if (!nextStatus || !VALID_STATUSES.has(nextStatus as LeadStatus)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'status must be "new", "contacted", or "closed"'
    )
  }

  const leadService = req.scope.resolve(INBOUND_LEAD_MODULE) as LeadService

  const [existing] = await leadService.listInbound_leads(
    { id: leadId },
    { take: 1 }
  )

  if (!existing) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Lead not found")
  }

  await assertCanUpdate(req, existing)

  const updated = await leadService.updateInbound_leads({
    id: leadId,
    status: nextStatus,
  })

  const row = Array.isArray(updated) ? updated[0] : updated

  res.status(200).json({
    lead: {
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
    },
  })
}
