/**
 * Inbound Leads — Contact Us + Apply Franchise queue for bakery ops.
 *
 * Data: GET /admin/leads, status updates via POST /admin/leads/:id
 */

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Envelope, ArrowPath } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Text,
  Toaster,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"

type LeadStatus = "new" | "contacted" | "closed"
type LeadType = "contact" | "franchise"

type AdminLead = {
  id: string
  type: LeadType
  name: string
  email: string
  phone: string | null
  message: string | null
  metadata: Record<string, unknown> | null
  franchise_id: string | null
  status: LeadStatus
  created_at: string
}

type LeadsResponse = {
  leads: AdminLead[]
  count: number
  limit: number
  offset: number
}

const STATUS_TABS: Array<{ key: LeadStatus | "all"; label: string }> = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
]

const TYPE_TABS: Array<{ key: LeadType | "all"; label: string }> = [
  { key: "all", label: "All types" },
  { key: "contact", label: "Contact Us" },
  { key: "franchise", label: "Franchise" },
]

const statusColor = (
  status: LeadStatus
): "orange" | "blue" | "green" | "grey" => {
  if (status === "new") return "orange"
  if (status === "contacted") return "blue"
  if (status === "closed") return "green"
  return "grey"
}

const typeColor = (type: LeadType): "purple" | "grey" =>
  type === "franchise" ? "purple" : "grey"

const metaString = (
  metadata: Record<string, unknown> | null,
  key: string
): string | null => {
  if (!metadata) return null
  const v = metadata[key]
  return typeof v === "string" && v.trim() ? v.trim() : null
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

const LeadsPage = () => {
  const [status, setStatus] = useState<LeadStatus | "all">("new")
  const [type, setType] = useState<LeadType | "all">("all")
  const queryClient = useQueryClient()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-leads", status, type],
    queryFn: () =>
      sdk.client.fetch<LeadsResponse>("/admin/leads", {
        query: { status, type, limit: 100 },
      }),
  })

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      next,
    }: {
      id: string
      next: LeadStatus
    }) =>
      sdk.client.fetch(`/admin/leads/${id}`, {
        method: "POST",
        body: { status: next },
      }),
    onSuccess: (_data, vars) => {
      const labels: Record<LeadStatus, string> = {
        new: "Marked as new",
        contacted: "Marked as contacted",
        closed: "Marked as closed",
      }
      toast.success(labels[vars.next])
      queryClient.invalidateQueries({ queryKey: ["admin-leads"] })
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update lead")
    },
  })

  const leads = data?.leads ?? []

  return (
    <div className="flex flex-col gap-y-4">
      <Toaster />
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <Heading level="h1">Inbound Leads</Heading>
            <Badge size="2xsmall" color="orange">
              {data?.count ?? 0}
              {status !== "all" ? ` ${status}` : ""}
            </Badge>
          </div>
          <Button
            variant="secondary"
            size="small"
            onClick={() => refetch()}
            isLoading={isFetching}
          >
            <ArrowPath />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 px-6 py-3">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.key}
              size="small"
              variant={status === tab.key ? "primary" : "secondary"}
              onClick={() => setStatus(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 px-6 py-3">
          {TYPE_TABS.map((tab) => (
            <Button
              key={tab.key}
              size="small"
              variant={type === tab.key ? "primary" : "secondary"}
              onClick={() => setType(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </Container>

      {isLoading ? (
        <Container className="p-6">
          <Text className="text-ui-fg-muted">Loading leads…</Text>
        </Container>
      ) : leads.length === 0 ? (
        <Container className="p-8 text-center">
          <Text className="text-ui-fg-muted">
            No{" "}
            {status !== "all" ? status : ""}
            {type !== "all" ? ` ${type}` : ""} leads right now.
          </Text>
          <Text size="small" className="text-ui-fg-muted mt-2 block">
            Submissions from Contact Us and Apply Franchise appear here.
          </Text>
        </Container>
      ) : (
        <div className="flex flex-col gap-3">
          {leads.map((lead) => {
            const city = metaString(lead.metadata, "city")
            const company = metaString(lead.metadata, "company")
            const investment = metaString(lead.metadata, "investment_range")
            const preferredArea = metaString(lead.metadata, "preferred_area")
            const experience = metaString(lead.metadata, "experience")

            return (
              <Container key={lead.id} className="p-0 divide-y">
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Text size="small" weight="plus">
                        {lead.name}
                      </Text>
                      <Badge size="2xsmall" color={typeColor(lead.type)}>
                        {lead.type === "franchise"
                          ? "Franchise application"
                          : "Contact"}
                      </Badge>
                      <Badge size="2xsmall" color={statusColor(lead.status)}>
                        {lead.status}
                      </Badge>
                      <Badge size="2xsmall" color="grey">
                        {formatDate(lead.created_at)}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <Text size="small" className="text-ui-fg-subtle">
                        <a
                          href={`mailto:${lead.email}`}
                          className="text-ui-fg-interactive hover:underline"
                        >
                          {lead.email}
                        </a>
                      </Text>
                      {lead.phone && (
                        <Text size="small" className="text-ui-fg-subtle">
                          <a
                            href={`tel:${lead.phone}`}
                            className="text-ui-fg-interactive hover:underline"
                          >
                            {lead.phone}
                          </a>
                        </Text>
                      )}
                    </div>

                    {lead.message && (
                      <Text
                        size="small"
                        className="text-ui-fg-subtle whitespace-pre-wrap"
                      >
                        {lead.message}
                      </Text>
                    )}

                    {(city ||
                      company ||
                      investment ||
                      preferredArea ||
                      experience) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {city && (
                          <Badge size="2xsmall" color="grey">
                            City: {city}
                          </Badge>
                        )}
                        {preferredArea && (
                          <Badge size="2xsmall" color="grey">
                            Area: {preferredArea}
                          </Badge>
                        )}
                        {company && (
                          <Badge size="2xsmall" color="grey">
                            Co: {company}
                          </Badge>
                        )}
                        {investment && (
                          <Badge size="2xsmall" color="grey">
                            Investment: {investment}
                          </Badge>
                        )}
                        {experience && (
                          <Badge size="2xsmall" color="grey">
                            Exp: {experience}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    {lead.status !== "contacted" && (
                      <Button
                        size="small"
                        variant={
                          lead.status === "new" ? "primary" : "secondary"
                        }
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          updateStatus.mutate({
                            id: lead.id,
                            next: "contacted",
                          })
                        }
                      >
                        Mark contacted
                      </Button>
                    )}
                    {lead.status !== "closed" && (
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          updateStatus.mutate({ id: lead.id, next: "closed" })
                        }
                      >
                        Close
                      </Button>
                    )}
                    {lead.status !== "new" && (
                      <Button
                        size="small"
                        variant="transparent"
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          updateStatus.mutate({ id: lead.id, next: "new" })
                        }
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>
              </Container>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Inbound Leads",
  icon: Envelope,
})

export default LeadsPage
