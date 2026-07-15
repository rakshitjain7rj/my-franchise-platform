/**
 * POST /store/leads
 *
 * Inbound lead intake for Contact Us and Apply Franchise forms.
 * Franchise header is optional (path is exempt) so cold visitors can apply.
 *
 * Body:
 * {
 *   type: "contact" | "franchise",
 *   name: string,
 *   email: string,
 *   phone?: string,
 *   message?: string,
 *   // franchise extras:
 *   city?: string,
 *   company?: string,
 *   investment_range?: string,
 *   preferred_area?: string,
 *   // free-form bag:
 *   metadata?: Record<string, unknown>
 * }
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { INBOUND_LEAD_MODULE } from "../../../modules/inbound_lead"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type LeadService = {
  createInbound_leads: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<Record<string, unknown> | Record<string, unknown>[]>
}

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const type = body.type

  if (type !== "contact" && type !== "franchise") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'type must be "contact" or "franchise"'
    )
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name || name.length > 120) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "name is required (max 120 characters)"
    )
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A valid email address is required"
    )
  }

  const phone =
    typeof body.phone === "string" && body.phone.trim()
      ? body.phone.trim().slice(0, 40)
      : null

  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim().slice(0, 4000)
      : null

  if (type === "contact" && !message) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "message is required for contact enquiries"
    )
  }

  // Franchise applications need a short note or city so ops can prioritise
  if (type === "franchise" && !message && !body.city && !body.preferred_area) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Please include a message, city, or preferred area for franchise applications"
    )
  }

  const extraMeta: Record<string, unknown> = {}
  if (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
    Object.assign(extraMeta, body.metadata as Record<string, unknown>)
  }

  for (const key of [
    "city",
    "company",
    "investment_range",
    "preferred_area",
    "experience",
  ] as const) {
    if (typeof body[key] === "string" && (body[key] as string).trim()) {
      extraMeta[key] = (body[key] as string).trim().slice(0, 200)
    }
  }

  const franchiseId =
    (typeof req.headers["x-franchise-id"] === "string"
      ? req.headers["x-franchise-id"].trim()
      : "") ||
    (typeof body.franchise_id === "string" ? body.franchise_id.trim() : "") ||
    null

  const leadService = req.scope.resolve(INBOUND_LEAD_MODULE) as LeadService
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  const created = await leadService.createInbound_leads({
    type,
    name,
    email,
    phone,
    message,
    metadata: Object.keys(extraMeta).length ? extraMeta : null,
    franchise_id: franchiseId,
    status: "new",
  })

  const lead = Array.isArray(created) ? created[0] : created

  logger.info(
    `[inbound_lead] type=${type} id=${lead.id} email=${email} franchise=${franchiseId ?? "none"}`
  )

  res.status(201).json({
    lead: {
      id: lead.id,
      type,
      status: "new",
      message:
        type === "franchise"
          ? "Thank you for your interest in franchising with Cake Break. Our partnerships team will be in touch shortly."
          : "Thank you for getting in touch. We’ll reply as soon as we can.",
    },
  })
}
