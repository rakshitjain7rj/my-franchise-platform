/**
 * Cake Orders — the bakery production board.
 *
 * Answers the owner's daily question at a glance: "which cakes do I need to
 * have ready, when, and with what on them?" Orders are grouped by collection
 * date (Today / Tomorrow / later), each card spelling out flavour, servings,
 * time slot, inscription, and any special message — no digging through the
 * native order screens or raw metadata.
 *
 * Data comes from GET /admin/cake-orders, which enforces franchise + store
 * scoping server-side, so franchise admins see their bakery only while the
 * super admin sees every order.
 */

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShoppingBag, ArrowPath } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

import {
  fetchCakeOrders,
  formatCollectionDate,
  formatMoney,
  isoDateWithOffset,
  type CakeOrder,
  type CakeOrderItem,
} from "../../lib/cake-orders"

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, "green" | "orange" | "red" | "grey" | "blue"> = {
  pending: "orange",
  completed: "green",
  canceled: "red",
  draft: "grey",
  archived: "grey",
}

const SpecRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline gap-2">
    <Text size="xsmall" className="text-ui-fg-muted uppercase tracking-wide shrink-0 w-28">
      {label}
    </Text>
    <Text size="small" weight="plus" className="text-ui-fg-base">
      {value}
    </Text>
  </div>
)

const CakeItemCard = ({ item }: { item: CakeOrderItem }) => {
  const { cake } = item
  return (
    <div className="flex gap-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={item.title}
          className="h-16 w-16 rounded-md object-cover shrink-0"
        />
      ) : (
        <div className="h-16 w-16 rounded-md bg-ui-bg-component shrink-0" />
      )}

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Text size="small" weight="plus" className="truncate">
            {item.product_title ?? item.title}
          </Text>
          <Badge size="2xsmall">× {item.quantity}</Badge>
          {item.variant_title && item.variant_title !== "Default variant" && (
            <Badge size="2xsmall" color="purple">
              {item.variant_title}
            </Badge>
          )}
        </div>

        {cake.flavor && <SpecRow label="Flavour" value={cake.flavor} />}
        {cake.servings && <SpecRow label="Servings" value={cake.servings} />}
        {cake.collection_time && (
          <SpecRow label="Time slot" value={cake.collection_time} />
        )}
        {Object.entries(cake.options).map(([key, value]) => (
          <SpecRow key={key} label={key} value={value} />
        ))}

        {cake.inscription && (
          <div className="rounded-md bg-ui-tag-purple-bg px-3 py-2 mt-1">
            <Text size="xsmall" className="text-ui-tag-purple-text">
              ✍️ Write on cake: “{cake.inscription}”
            </Text>
          </div>
        )}
        {cake.special_message && (
          <div className="rounded-md bg-ui-tag-orange-bg px-3 py-2 mt-1">
            <Text size="xsmall" className="text-ui-tag-orange-text">
              📝 {cake.special_message}
            </Text>
          </div>
        )}
        {cake.photo_url && (
          <a
            href={cake.photo_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block w-16 h-16 rounded-md overflow-hidden border border-ui-border-base"
          >
            <img
              src={cake.photo_url}
              alt="Edible photo"
              className="w-full h-full object-cover"
            />
          </a>
        )}
      </div>
    </div>
  )
}

const OrderCard = ({ order }: { order: CakeOrder }) => (
  <div className="rounded-xl border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest overflow-hidden">
    {/* Header */}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ui-border-base px-5 py-3 bg-ui-bg-subtle">
      <Link
        to={`/orders/${order.id}`}
        className="text-ui-fg-interactive hover:underline"
      >
        <Text size="small" weight="plus">
          Order {order.display_id != null ? `#${order.display_id}` : order.id}
        </Text>
      </Link>
      <Badge size="2xsmall" color={STATUS_COLORS[order.status] ?? "grey"}>
        {order.status}
      </Badge>
      {order.fulfillment_method && (
        <Badge size="2xsmall" color="blue">
          {order.fulfillment_method === "pickup" ? "Store pickup" : order.fulfillment_method}
        </Badge>
      )}
      {order.store_location && (
        <Badge size="2xsmall" color="purple">
          🏬 {order.store_location.name ?? order.store_location.code ?? "Store"}
        </Badge>
      )}
      <div className="ml-auto text-right">
        <Text size="small" weight="plus">
          {formatMoney(order.total, order.currency_code)}
        </Text>
      </div>
    </div>

    {/* Customer strip */}
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2.5 border-b border-ui-border-base">
      <Text size="xsmall" className="text-ui-fg-subtle">
        👤 {order.customer_name ?? "Guest"}
      </Text>
      {order.email && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          ✉️ {order.email}
        </Text>
      )}
      {order.phone && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          📞 {order.phone}
        </Text>
      )}
      <Text size="xsmall" className="text-ui-fg-muted ml-auto">
        Placed {new Date(order.created_at).toLocaleString("en-GB")}
      </Text>
    </div>

    {/* Items */}
    <div className="space-y-3 px-5 py-4">
      {order.items.map((item) => (
        <CakeItemCard key={item.id} item={item} />
      ))}
      {order.notes_for_baker && (
        <div className="rounded-md border border-dashed border-ui-border-strong px-3 py-2">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Note for the bakers: “{order.notes_for_baker}”
          </Text>
        </div>
      )}
    </div>
  </div>
)

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type DateFilter = "all" | "today" | "tomorrow"

const CakeOrdersPage = () => {
  const [dateFilter, setDateFilter] = useState<DateFilter>("all")

  const date =
    dateFilter === "today"
      ? isoDateWithOffset(0)
      : dateFilter === "tomorrow"
        ? isoDateWithOffset(1)
        : undefined

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["cake-orders", dateFilter],
    queryFn: () => fetchCakeOrders({ date, limit: 100 }),
    refetchInterval: 30_000,
  })

  // Group by collection date, soonest first; undated orders last.
  const groups = useMemo(() => {
    const byDate = new Map<string, CakeOrder[]>()
    for (const order of data?.orders ?? []) {
      const key = order.collection_date ?? "unscheduled"
      byDate.set(key, [...(byDate.get(key) ?? []), order])
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => {
      if (a === "unscheduled") return 1
      if (b === "unscheduled") return -1
      return a.localeCompare(b)
    })
  }, [data])

  const today = isoDateWithOffset(0)
  const tomorrow = isoDateWithOffset(1)

  const groupTitle = (key: string) => {
    if (key === "unscheduled") return "No collection date"
    if (key === today) return `Today — ${formatCollectionDate(key)}`
    if (key === tomorrow) return `Tomorrow — ${formatCollectionDate(key)}`
    return formatCollectionDate(key)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Cake Orders</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Every order with its flavour, inscription and collection slot —
            grouped by the day it must be ready.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          {(["all", "today", "tomorrow"] as DateFilter[]).map((filter) => (
            <Button
              key={filter}
              size="small"
              variant={dateFilter === filter ? "primary" : "secondary"}
              onClick={() => setDateFilter(filter)}
            >
              {filter === "all" ? "All" : filter === "today" ? "Today" : "Tomorrow"}
            </Button>
          ))}
          <Button
            size="small"
            variant="transparent"
            onClick={() => refetch()}
            isLoading={isFetching}
          >
            <ArrowPath />
          </Button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-8">
        {isLoading && (
          <Text size="small" className="text-ui-fg-muted">
            Loading cake orders…
          </Text>
        )}
        {isError && (
          <Text size="small" className="text-ui-fg-error">
            Could not load cake orders. Check that you are logged in and try again.
          </Text>
        )}
        {!isLoading && !isError && groups.length === 0 && (
          <div className="rounded-lg border border-dashed border-ui-border-strong p-10 text-center">
            <Text size="small" className="text-ui-fg-muted">
              {dateFilter === "all"
                ? "No cake orders yet. New storefront orders will appear here automatically."
                : `No cakes to prepare ${dateFilter}.`}
            </Text>
          </div>
        )}

        {groups.map(([key, orders]) => (
          <section key={key} className="space-y-3">
            <div className="flex items-center gap-3">
              <Heading level="h2">{groupTitle(key)}</Heading>
              <Badge size="2xsmall">{orders.length} order{orders.length === 1 ? "" : "s"}</Badge>
            </div>
            <div className="space-y-4">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Cake Orders",
  icon: ShoppingBag,
})

export default CakeOrdersPage
