/**
 * order-cake-details.tsx
 *
 * Widget injected at the top of the native admin order-detail page. Surfaces
 * the cake-specific data the storefront stored in line-item / order metadata
 * (sponge flavour, servings, jam filling, collection date & time, inscription,
 * special message, fulfilling store) so the bakery owner never has to read raw JSON.
 *
 * Data source: GET /admin/cake-orders?order_id=… (franchise + store scoped
 * server-side; see src/api/admin/cake-orders/route.ts).
 */

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  BuildingStorefront,
  Clock,
  CreditCard,
  TruckFast,
} from "@medusajs/icons"
import { Badge, Button, Container, Heading, Skeleton, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  fetchCakeOrders,
  fulfillCakeOrder,
  formatCollectionDate,
  formatFulfillmentMethod,
  fulfillmentBadgeColor,
  getApiErrorMessage,
  paymentBadgeColor,
  type CakeOrderItem,
} from "../lib/cake-orders"

const Spec = ({ label, value }: { label: string; value: string }) => (
  <div>
    <Text size="xsmall" className="text-ui-fg-muted uppercase tracking-wide">
      {label}
    </Text>
    <Text size="small" weight="plus">
      {value}
    </Text>
  </div>
)

const ItemSpecs = ({ item }: { item: CakeOrderItem }) => {
  const { cake } = item
  const hasCakeData =
    cake.flavor ||
    cake.servings ||
    cake.jam ||
    cake.collection_date ||
    cake.collection_time ||
    cake.inscription ||
    cake.special_message ||
    cake.photo_url ||
    Object.keys(cake.options).length > 0

  return (
    <div className="rounded-lg border border-ui-border-base p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Text size="small" weight="plus">
          {item.product_title ?? item.title}
        </Text>
        <Badge size="2xsmall">× {item.quantity}</Badge>
        {item.variant_title && item.variant_title !== "Default variant" && (
          <Badge size="2xsmall" color="purple">
            {item.variant_title}
          </Badge>
        )}
      </div>

      {!hasCakeData ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          No customization was provided for this item.
        </Text>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {cake.collection_date && (
              <Spec
                label="Collection date"
                value={formatCollectionDate(cake.collection_date)}
              />
            )}
            {cake.collection_time && (
              <Spec label="Time slot" value={cake.collection_time} />
            )}
            {cake.flavor && <Spec label="Sponge flavour" value={cake.flavor} />}
            {cake.servings && <Spec label="Servings" value={cake.servings} />}
            {cake.jam && <Spec label="Jam filling" value={cake.jam} />}
            {Object.entries(cake.options).map(([key, value]) => (
              <Spec key={key} label={key} value={value} />
            ))}
          </div>

          {cake.inscription && (
            <div className="rounded-md bg-ui-tag-purple-bg px-3 py-2">
              <Text size="xsmall" className="text-ui-tag-purple-text">
                Write on cake: “{cake.inscription}”
              </Text>
            </div>
          )}
          {cake.special_message && (
            <div className="rounded-md bg-ui-tag-orange-bg px-3 py-2">
              <Text size="xsmall" className="text-ui-tag-orange-text">
                Special instructions: “{cake.special_message}”
              </Text>
            </div>
          )}
          {cake.photo_url && (
            <div className="space-y-1">
              <Text size="xsmall" className="text-ui-fg-muted uppercase tracking-wide">
                Edible photo
              </Text>
              <a
                href={cake.photo_url}
                target="_blank"
                rel="noreferrer"
                className="block w-24 h-24 rounded-md overflow-hidden border border-ui-border-base"
              >
                <img
                  src={cake.photo_url}
                  alt="Customer photo for cake"
                  className="w-full h-full object-cover"
                />
              </a>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const OrderCakeDetailsWidget = ({ data }: { data: { id: string } }) => {
  const queryClient = useQueryClient()
  const { data: response, isLoading } = useQuery({
    queryKey: ["cake-order-details", data.id],
    queryFn: () => fetchCakeOrders({ order_id: data.id }),
  })

  const fulfillMutation = useMutation({
    mutationFn: () => fulfillCakeOrder(data.id),
    onSuccess: () => {
      toast.success("Order fulfilled", {
        description:
          "Items fulfilled using the order's store, stock location, and shipping method.",
      })
      void queryClient.invalidateQueries({
        queryKey: ["cake-order-details", data.id],
      })
      void queryClient.invalidateQueries({ queryKey: ["cake-orders"] })
      // Refresh the native Medusa order detail so fulfillment status updates.
      void queryClient.invalidateQueries({ queryKey: ["order", data.id] })
      void queryClient.invalidateQueries({ queryKey: ["orders"] })
    },
    onError: (err: unknown) => {
      toast.error("Could not fulfill order", {
        description: getApiErrorMessage(err, "Something went wrong."),
      })
    },
  })

  const order = response?.orders?.[0]

  if (isLoading) {
    return (
      <Container
        className="divide-y p-0"
        aria-busy="true"
        aria-label="Loading cake details"
      >
        <div className="flex flex-wrap items-center gap-2 px-6 py-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="space-y-3 px-6 py-4">
          <div className="rounded-lg border border-ui-border-base p-4 space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        </div>
      </Container>
    )
  }

  // No cake-specific payload for this order — stay silent so the native
  // order view is not cluttered with an empty panel.
  if (!order) {
    return null
  }

  const needsFulfill =
    (order.fulfillment_status ?? "not_fulfilled") === "not_fulfilled" ||
    (order.fulfillment_status ?? "").startsWith("partially")
  const storeLabel =
    order.store_location?.name ?? order.store_location?.code ?? "selected store"
  const readyFor =
    order.fulfillment_method === "delivery" ? "delivery" : "collection"

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        <Heading level="h2">Cake Details</Heading>
        {order.collection_date && (
          <Badge size="2xsmall" color="green">
            <Clock />
            Ready by {formatCollectionDate(order.collection_date)}
            {order.requested_pickup_time
              ? ` · ${order.requested_pickup_time}`
              : ""}
          </Badge>
        )}
        {order.payment_status && (
          <Badge size="2xsmall" color={paymentBadgeColor(order.payment_status)}>
            <CreditCard />
            {order.payment_status}
          </Badge>
        )}
        {order.fulfillment_status && (
          <Badge
            size="2xsmall"
            color={fulfillmentBadgeColor(order.fulfillment_status)}
          >
            <TruckFast />
            {order.fulfillment_status.replace(/_/g, " ")}
          </Badge>
        )}
        {order.fulfillment_method && (
          <Badge size="2xsmall" color="blue">
            {formatFulfillmentMethod(order.fulfillment_method)}
          </Badge>
        )}
        {order.store_location && (
          <Badge size="2xsmall" color="purple">
            <BuildingStorefront />
            {order.store_location.name ?? order.store_location.code ?? "Store"}
          </Badge>
        )}
        {needsFulfill && (
          <div className="ml-auto">
            <Button
              size="small"
              variant="primary"
              isLoading={fulfillMutation.isPending}
              disabled={fulfillMutation.isPending}
              onClick={() => fulfillMutation.mutate()}
            >
              Fulfill items
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3 px-6 py-4">
        {order.items.map((item) => (
          <ItemSpecs key={item.id} item={item} />
        ))}
        {order.notes_for_baker && (
          <div className="rounded-md border border-dashed border-ui-border-strong px-3 py-2">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Note for the bakers: “{order.notes_for_baker}”
            </Text>
          </div>
        )}
        {needsFulfill && (
          <div className="rounded-md bg-ui-tag-blue-bg px-3 py-2">
            <Text size="xsmall" className="text-ui-tag-blue-text">
              Ready for {readyFor}? Click{" "}
              <strong>Fulfill items</strong> to fulfill immediately from{" "}
              {storeLabel} using the customer&apos;s shipping method — no
              location picker required.
            </Text>
          </div>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default OrderCakeDetailsWidget
