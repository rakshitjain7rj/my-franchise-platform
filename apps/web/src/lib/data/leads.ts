/**
 * Client helper for POST /store/leads (contact + franchise forms).
 */

import { getMedusaHeadersSync } from "@/lib/medusa/headers"

const BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ??
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ??
  "http://localhost:9000"

export type LeadType = "contact" | "franchise"

export type SubmitLeadInput = {
  type: LeadType
  name: string
  email: string
  phone?: string
  message?: string
  city?: string
  company?: string
  investment_range?: string
  preferred_area?: string
  experience?: string
}

export async function submitLead(
  input: SubmitLeadInput
): Promise<{ id: string; message: string }> {
  const headers = getMedusaHeadersSync()

  const res = await fetch(`${BACKEND_URL}/store/leads`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { message?: string }).message ??
        `Could not send your message (${res.status})`
    )
  }

  const json = (await res.json()) as {
    lead?: { id?: string; message?: string }
  }

  return {
    id: json.lead?.id ?? "",
    message:
      json.lead?.message ??
      "Thank you — we have received your message.",
  }
}
