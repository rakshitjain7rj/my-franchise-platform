/**
 * @file scope-franchise-returns.ts
 * @description Tenant-scoping middleware for /admin/returns,
 * /admin/exchanges, /admin/claims, /admin/draft-orders, and
 * /admin/payment-collections routes.
 *
 * Security Model
 * ──────────────
 * Returns, exchanges, and claims all reference an Order, which belongs
 * to a SalesChannel, which belongs to a Franchise:
 *
 *   User ──[franchise-user]──► Franchise
 *   Franchise ──► SalesChannels
 *   SalesChannels ──► Orders
 *   Orders ──► Returns | Exchanges | Claims | PaymentCollections
 *
 * For draft orders, the chain is:
 *   Franchise ──► SalesChannels ──► DraftOrders
 *
 * Super Admins bypass all checks.
 */

import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  resolveAdminFranchiseIds,
  isSuperAdminUser,
  getSalesChannelIdsForFranchises,
  type AuthenticatedTenantRequest,
} from "../../utils/tenant-context"

/**
 * Resolve all Order IDs that belong to the given sales channels.
 */
const getOrderIdsForSalesChannels = async (
  req: MedusaRequest,
  salesChannelIds: string[]
): Promise<string[]> => {
  if (!salesChannelIds.length) return []

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { sales_channel_id: salesChannelIds },
  })

  return (orders as Array<{ id?: string }>)
    .map((o) => o.id)
    .filter((id): id is string => Boolean(id))
}

/**
 * Generic isolation factory for resources that reference an order_id field.
 * Pass the entity name and the field that links to order (e.g. "order_id").
 */
const makeFranchiseOrderChildMiddleware = (
  entity: string,
  orderIdField: string,
  emptyShape: Record<string, unknown>
) => async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const isSuper = await isSuperAdminUser(req)
    if (isSuper) return next()

    let franchiseIds: string[]
    try {
      franchiseIds = await resolveAdminFranchiseIds(req as AuthenticatedTenantRequest)
    } catch {
      res.status(200).json({ ...emptyShape, count: 0, offset: 0, limit: 0 })
      return
    }

    if (!franchiseIds.length) {
      res.status(200).json({ ...emptyShape, count: 0, offset: 0, limit: 0 })
      return
    }

    const salesChannelIds = await getSalesChannelIdsForFranchises(req, franchiseIds)
    if (!salesChannelIds.length) {
      res.status(200).json({ ...emptyShape, count: 0, offset: 0, limit: 0 })
      return
    }

    const allowedOrderIds = await getOrderIdsForSalesChannels(req, salesChannelIds)

    // Base-route create (POST without :id): the order this resource is being
    // created against is supplied in the request body. Validate it belongs to
    // the caller's franchise so a franchise admin cannot create a
    // return/exchange/claim against another franchise's order.
    const requestedId = req.params?.id
    if (!requestedId && req.method === "POST") {
      const bodyOrderId =
        (req.validatedBody as { order_id?: string } | undefined)?.order_id ??
        (req.body as { order_id?: string } | undefined)?.order_id
      if (!bodyOrderId || !allowedOrderIds.includes(bodyOrderId)) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
      }
      return next()
    }

    // Single-resource :id guard — check ownership via the entity
    if (requestedId) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: records } = await query.graph({
        entity,
        fields: [orderIdField],
        filters: { id: requestedId },
      })

      const record = (records as Array<Record<string, unknown>>)[0]
      if (!record) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Resource not found")
      }

      const orderIdValue = record[orderIdField] as string | undefined
      if (!orderIdValue || !allowedOrderIds.includes(orderIdValue)) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Resource not found")
      }
    } else if (!allowedOrderIds.length) {
      // CRITICAL: Medusa ignores an empty `order_id: []` filter and would return
      // ALL records. Short-circuit with an empty result instead of leaking.
      res.status(200).json({ ...emptyShape, count: 0, offset: 0, limit: 0 })
      return
    }

    // Inject allow-list filter via order_id IN (...)
    req.filterableFields = {
      ...(req.filterableFields ?? {}),
      [orderIdField]: allowedOrderIds,
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}

/**
 * Scope /admin/returns to the franchise's orders.
 */
export const scopeFranchiseReturns = makeFranchiseOrderChildMiddleware(
  "return",
  "order_id",
  { returns: [] }
)

/**
 * Scope /admin/exchanges to the franchise's orders.
 */
export const scopeFranchiseExchanges = makeFranchiseOrderChildMiddleware(
  "exchange",
  "order_id",
  { exchanges: [] }
)

/**
 * Scope /admin/claims to the franchise's orders.
 */
export const scopeFranchiseClaims = makeFranchiseOrderChildMiddleware(
  "claim",
  "order_id",
  { claims: [] }
)

/**
 * Scope /admin/payment-collections to the franchise's orders.
 *
 * Unlike returns/exchanges/claims, a `payment_collection` has **no native
 * `order_id` column** — it is linked to an order via the
 * `order-payment-collection` link module. There is also no GET list/retrieve
 * route (only base POST create and `:id` DELETE + action sub-routes). So we:
 *   - On create (POST, no :id): validate the body's `order_id`.
 *   - On single-resource (:id / :id/*): resolve the owning order via the
 *     `order.payment_collections` relation and confirm it is in the allow-list.
 */
export const scopeFranchisePaymentCollections = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const isSuper = await isSuperAdminUser(req)
    if (isSuper) return next()

    let franchiseIds: string[]
    try {
      franchiseIds = await resolveAdminFranchiseIds(req as AuthenticatedTenantRequest)
    } catch {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Payment collection not found")
    }

    if (!franchiseIds.length) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Payment collection not found")
    }

    const salesChannelIds = await getSalesChannelIdsForFranchises(req, franchiseIds)
    const allowedOrderIds = salesChannelIds.length
      ? await getOrderIdsForSalesChannels(req, salesChannelIds)
      : []

    const requestedId = req.params?.id

    // Create (POST, no :id): validate the body's order_id.
    if (!requestedId && req.method === "POST") {
      const bodyOrderId =
        (req.validatedBody as { order_id?: string } | undefined)?.order_id ??
        (req.body as { order_id?: string } | undefined)?.order_id
      if (!bodyOrderId || !allowedOrderIds.includes(bodyOrderId)) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
      }
      return next()
    }

    // Single-resource (:id and :id/* action routes): resolve ownership through
    // the order → payment_collections relation.
    if (requestedId) {
      if (!allowedOrderIds.length) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Payment collection not found")
      }

      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id", "payment_collections.id"],
        filters: { id: allowedOrderIds },
      })

      const ownsCollection = (orders as Array<{ payment_collections?: Array<{ id?: string }> }>)
        .some((o) => (o.payment_collections ?? []).some((pc) => pc?.id === requestedId))

      if (!ownsCollection) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Payment collection not found")
      }
    }

    return next()
  } catch (err: unknown) {
    next(err)
  }
}

/**
 * Scope /admin/draft-orders to the franchise's sales channels.
 * Draft orders link via sales_channel_id rather than order_id.
 */
export const scopeFranchiseDraftOrders = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const isSuper = await isSuperAdminUser(req)
    if (isSuper) return next()

    let franchiseIds: string[]
    try {
      franchiseIds = await resolveAdminFranchiseIds(req as AuthenticatedTenantRequest)
    } catch {
      res.status(200).json({ draft_orders: [], count: 0, offset: 0, limit: 0 })
      return
    }

    if (!franchiseIds.length) {
      res.status(200).json({ draft_orders: [], count: 0, offset: 0, limit: 0 })
      return
    }

    const salesChannelIds = await getSalesChannelIdsForFranchises(req, franchiseIds)
    if (!salesChannelIds.length) {
      res.status(200).json({ draft_orders: [], count: 0, offset: 0, limit: 0 })
      return
    }

    const requestedId = req.params?.id
    if (requestedId) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: records } = await query.graph({
        entity: "draft_order",
        fields: ["sales_channel_id"],
        filters: { id: requestedId },
      })
      const record = (records as Array<{ sales_channel_id?: string }>)[0]
      if (!record || !record.sales_channel_id || !salesChannelIds.includes(record.sales_channel_id)) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Draft order not found")
      }
    }

    req.filterableFields = {
      ...(req.filterableFields ?? {}),
      sales_channel_id: salesChannelIds,
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}
