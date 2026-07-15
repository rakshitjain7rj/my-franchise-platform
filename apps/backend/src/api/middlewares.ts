import {
  authenticate,
  defineMiddlewares,
  type MedusaRequest,
  type MedusaResponse,
  type MedusaNextFunction,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import multer from "multer"
import {
  filterStoreProductsByFranchise,
  filterAdminProductsByFranchise,
  guardAdminProductMutation,
} from "./middlewares/filter-products-by-franchise"
import { captureCatalogueQueryFilters } from "../utils/catalogue-product-filters"
import {
  scopeFranchiseOrderList,
  guardFranchiseOrderSingleResource,
} from "./middlewares/scope-franchise-orders"
import {
  scopeStoreOrderList,
  guardStoreOrderSingleResource,
} from "./middlewares/scope-store-orders"
import { injectAdminFranchiseForProductCreation } from "./middlewares/inject-franchise-for-product-creation"
import { filterAdminSalesChannelsByFranchise } from "./middlewares/filter-sales-channels-by-franchise"
import { filterAdminStockLocationsByFranchise } from "./middlewares/filter-stock-locations-by-franchise"
import { filterAdminInventoryByFranchise } from "./middlewares/scope-franchise-inventory"
import { filterAdminCustomersByFranchise } from "./middlewares/scope-franchise-customers"
import {
  scopeFranchiseReturns,
  scopeFranchiseExchanges,
  scopeFranchiseClaims,
  scopeFranchisePaymentCollections,
  scopeFranchiseDraftOrders,
} from "./middlewares/scope-franchise-returns"
import { filterAdminReservationsByFranchise } from "./middlewares/scope-franchise-reservations"
import {
  blockFranchiseAdminMutations,
  blockFranchiseAdminAll,
} from "./middlewares/guard-franchise-resource-mutations"
import {
  customerLoginRateLimiter,
  customerRegisterRateLimiter,
} from "./middlewares/rate-limit-auth"
import FranchiseSalesChannelLink from "../links/franchise-sales-channel"

// ── Request augmentation ────────────────────────────────────────────────────

declare module "@medusajs/framework/http" {
  interface MedusaRequest {
    franchise_id?: string
    /**
     * Medusa v2 pricing context — `sales_channel_id` tells the pricing module
     * which channel's price-set to evaluate when computing variant prices.
     */
    pricing_context?: Record<string, unknown>
  }
}

// ── Constants ───────────────────────────────────────────────────────────────

const FRANCHISE_HEADER = "x-franchise-id"
const MISSING_FRANCHISE_RESPONSE = {
  message: "Missing required header: x-franchise-id",
  code: "MISSING_FRANCHISE_ID",
}

const isStorePath = (path: string) =>
  path.startsWith("/store") || path.startsWith("/api/store")

const getRequestPath = (req: MedusaRequest) => req.path ?? req.url ?? ""

const getHeaderValue = (value: string | string[] | undefined) => {
  const headerValue = Array.isArray(value) ? value[0] : value
  return headerValue?.trim()
}

/**
 * Paths under /store that are exempt from the x-franchise-id requirement.
 */
const FRANCHISE_EXEMPT_STORE_PATHS = [
  "/store/franchises",
  "/store/cart-inventory-check",
  // Cart restore lookup is scoped purely by the authenticated customer; it
  // must keep working even when the franchise cookie is absent.
  "/store/active-cart",
  // Contact / franchise application forms — cold visitors have no cookie yet.
  "/store/leads",
]

const rejectMissingStoreFranchise = (
  req: MedusaRequest,
  res: MedusaResponse,
  franchiseId?: string
) => {
  if (franchiseId || !isStorePath(getRequestPath(req))) {
    return false
  }

  const requestPath = getRequestPath(req)
  if (FRANCHISE_EXEMPT_STORE_PATHS.some((p) => requestPath.startsWith(p))) {
    return false
  }

  res.status(400).json(MISSING_FRANCHISE_RESPONSE)
  return true
}

// ── Tenant middleware ────────────────────────────────────────────────────────

/**
 * franchiseTenantMiddleware
 *
 * Stamps `req.franchise_id` from the `x-franchise-id` header, then — for store
 * routes — resolves the franchise's sales channel via the
 * `franchise-sales-channel` link table (the single source of truth) and injects
 * it into `req.pricing_context` and `req.query/validatedQuery` so that Medusa's
 * pricing engine and catalogue filter both see the correct channel.
 *
 * Resolution chain (Phase 3 — single source of truth):
 *   franchise_id
 *     ──[franchise-sales-channel link]──▶  sales_channel_id
 *
 * Replaces the previous two-step chain:
 *   franchise → franchise-store → store.default_sales_channel_id
 *
 * The old chain is retired. The `franchise-sales-channel` link table is now the
 * canonical association and must be kept up-to-date by the provisioning workflow.
 */
export const franchiseTenantMiddleware = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const franchiseId = getHeaderValue(req.headers[FRANCHISE_HEADER])

  if (franchiseId) {
    req.franchise_id = franchiseId
  }

  if (rejectMissingStoreFranchise(req, res, franchiseId)) {
    return
  }

  if (franchiseId && isStorePath(getRequestPath(req)) && req.scope) {
    try {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

      // ── Single-source resolution: franchise → sales channel ────────────────
      const { data: scLinks } = await query.graph({
        entity: FranchiseSalesChannelLink.entryPoint,
        fields: ["sales_channel_id"],
        filters: { franchise_id: franchiseId },
      })

      const salesChannelIds = Array.from(
        new Set(
          (scLinks as Array<{ sales_channel_id?: string }>)
            .map((l) => l.sales_channel_id)
            .filter((id): id is string => Boolean(id))
        )
      )

      if (!salesChannelIds.length) {
        console.warn(
          `[franchiseTenantMiddleware] No sales channels found for franchise_id=${franchiseId}. ` +
            `Pricing will fall back to Medusa default.`
        )
      } else {
        const salesChannelId = salesChannelIds[0]

        // Inject into pricing context for the pricing module
        req.pricing_context = {
          ...(req.pricing_context ?? {}),
          sales_channel_id: salesChannelId,
        }

        // Merge into query/validatedQuery for catalogue filtering
        const existingQuerySC = req.query?.sales_channel_id
        const existingValidatedQuerySC = req.validatedQuery?.sales_channel_id

        let scArray: string[] = []

        if (existingQuerySC) {
          if (Array.isArray(existingQuerySC)) {
            scArray.push(...(existingQuerySC as string[]))
          } else {
            scArray.push(existingQuerySC as string)
          }
        }

        if (existingValidatedQuerySC) {
          if (Array.isArray(existingValidatedQuerySC)) {
            existingValidatedQuerySC.forEach((id: any) => {
              if (!scArray.includes(id)) scArray.push(id)
            })
          } else {
            const id = existingValidatedQuerySC as string
            if (!scArray.includes(id)) scArray.push(id)
          }
        }

        if (!scArray.includes(salesChannelId)) {
          scArray.push(salesChannelId)
        }

        req.query = { ...(req.query ?? {}), sales_channel_id: scArray }
        req.validatedQuery = {
          ...(req.validatedQuery ?? {}),
          sales_channel_id: scArray,
        }

        if (req.method === "POST" || req.method === "PUT") {
          const body = req.body as any
          if (body && typeof body === "object") {
            if (!body.sales_channel_id) {
              body.sales_channel_id = salesChannelId
            }
          }
          const validatedBody = req.validatedBody as any
          if (validatedBody && typeof validatedBody === "object") {
            validatedBody.sales_channel_id =
              validatedBody.sales_channel_id || salesChannelId
          }
        }
      }
    } catch (err) {
      console.error(
        `[franchiseTenantMiddleware] Error resolving sales channel for franchise_id=${franchiseId}:`,
        err
      )
    }
  }

  next()
}

// ── Auth shorthand ────────────────────────────────────────────────────────────

const userAuth = authenticate("user", ["session", "bearer", "api-key"])

// ── Block-mutation resource config ────────────────────────────────────────────
//
// Resources where franchise admins are read-only (mutations blocked) or fully
// blocked. Instead of copy-pasting {matcher, methods, middlewares} for every
// resource, we define a table and derive the route config from it.
//
// readonly  → blockFranchiseAdminMutations on POST/PUT/PATCH/DELETE
// blocked   → blockFranchiseAdminAll on all methods
//
// For resources with sub-routes (:id/*), we automatically generate those entries.

type ResourcePolicy = {
  path: string
  policy: "readonly" | "blocked"
  hasSubRoutes?: boolean
}

const RESTRICTED_RESOURCES: ResourcePolicy[] = [
  { path: "/admin/price-lists",         policy: "readonly",  hasSubRoutes: true  },
  { path: "/admin/promotions",          policy: "readonly",  hasSubRoutes: false },
  { path: "/admin/gift-cards",          policy: "blocked",   hasSubRoutes: false },
  { path: "/admin/customer-groups",     policy: "readonly",  hasSubRoutes: false },
  { path: "/admin/api-keys",            policy: "blocked",   hasSubRoutes: false },
  { path: "/admin/publishable-api-keys",policy: "blocked",   hasSubRoutes: false },
  { path: "/admin/product-categories",  policy: "readonly",  hasSubRoutes: false },
  { path: "/admin/collections",         policy: "readonly",  hasSubRoutes: false },
  { path: "/admin/shipping-options",    policy: "readonly",  hasSubRoutes: false },
  { path: "/admin/fulfillment-sets",    policy: "readonly",  hasSubRoutes: false },
  { path: "/admin/regions",             policy: "readonly",  hasSubRoutes: false },
  { path: "/admin/tax-regions",         policy: "readonly",  hasSubRoutes: false },
  { path: "/admin/tax-rates",           policy: "readonly",  hasSubRoutes: false },
  { path: "/admin/workflows",           policy: "readonly",  hasSubRoutes: true  },
  { path: "/admin/return-reasons",      policy: "readonly",  hasSubRoutes: false },
  { path: "/admin/product-types",       policy: "readonly",  hasSubRoutes: false },
  { path: "/admin/product-tags",        policy: "readonly",  hasSubRoutes: false },
]

const UPLOAD_BLOCKED_METHODS = ["DELETE"] as import("@medusajs/framework/http").MiddlewareVerb[]

/** Memory storage — buffers are base64-encoded into uploadFilesWorkflow. */
const storePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
})

function buildRestrictedRoutes() {
  const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const

  return RESTRICTED_RESOURCES.flatMap((resource) => {
    const middleware =
      resource.policy === "blocked"
        ? blockFranchiseAdminAll
        : blockFranchiseAdminMutations

    const methods =
      resource.policy === "blocked" ? undefined : [...MUTATION_METHODS]

    const entries = [
      // Base path
      {
        matcher: resource.path,
        ...(methods ? { methods } : {}),
        middlewares: [userAuth, middleware],
      },
      // :id path
      {
        matcher: `${resource.path}/:id`,
        ...(methods ? { methods } : {}),
        middlewares: [userAuth, middleware],
      },
    ]

    if (resource.hasSubRoutes) {
      entries.push({
        matcher: `${resource.path}/:id/*`,
        ...(methods ? { methods } : {}),
        middlewares: [userAuth, middleware],
      })
    }

    return entries
  })
}

// ── Middleware registration ───────────────────────────────────────────────────

export default defineMiddlewares({
  routes: [
    // ── Customer auth brute-force protection ──────────────────────────────────
    // Applies to Medusa's built-in emailpass endpoints. The register matcher is
    // more specific and does NOT overlap the login matcher (no wildcard).
    {
      matcher: "/auth/customer/emailpass",
      methods: ["POST"],
      middlewares: [customerLoginRateLimiter],
    },
    {
      matcher: "/auth/customer/emailpass/register",
      methods: ["POST"],
      middlewares: [customerRegisterRateLimiter],
    },

    // ── Global tenant context ─────────────────────────────────────────────────
    { matcher: "/store/*", middlewares: [franchiseTenantMiddleware] },
    { matcher: "/admin/*", middlewares: [franchiseTenantMiddleware] },

    // ── Customer cart restore ─────────────────────────────────────────────────
    {
      matcher: "/store/active-cart",
      methods: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },

    // ── Store product scoping ─────────────────────────────────────────────────
    // Global (no methods): runs before Medusa's strict query validator so we can
    // accept sponge/min_price/max_price, stash them, then strip them.
    {
      matcher: "/store/products",
      middlewares: [captureCatalogueQueryFilters],
    },
    { matcher: "/store/products",     methods: ["GET"], middlewares: [filterStoreProductsByFranchise] },
    { matcher: "/store/products/:id", methods: ["GET"], middlewares: [filterStoreProductsByFranchise] },

    // ── Store cake photo upload (multipart → File Module) ─────────────────────
    // bodyParser: false so Express JSON parser does not consume the stream
    // before multer reads the multipart body.
    {
      matcher: "/store/uploads",
      methods: ["POST"],
      bodyParser: false,
      middlewares: [storePhotoUpload.array("files", 1)],
    },

    // ── Admin product scoping ─────────────────────────────────────────────────
    { matcher: "/admin/products",     methods: ["GET"], middlewares: [filterAdminProductsByFranchise] },
    {
      matcher: "/admin/products",
      methods: ["POST"],
      middlewares: [userAuth, injectAdminFranchiseForProductCreation],
      additionalDataValidator: {
        franchise_id: z.union([z.string(), z.array(z.string())]).optional(),
      },
    },
    { matcher: "/admin/products/:id", methods: ["GET"],              middlewares: [filterAdminProductsByFranchise] },
    { matcher: "/admin/products/:id", methods: ["POST", "DELETE"],   middlewares: [userAuth, guardAdminProductMutation] },
    { matcher: "/admin/products/:id/*",                              middlewares: [userAuth, guardAdminProductMutation] },

    // ── Admin franchise dashboard & custom routes ─────────────────────────────
    { matcher: "/admin/franchise-dashboard",       middlewares: [userAuth] },
    { matcher: "/admin/franchise-dashboard/*",     middlewares: [userAuth] },
    { matcher: "/admin/franchise-locations",       middlewares: [userAuth] },
    { matcher: "/admin/franchise-locations/:id",   middlewares: [userAuth] },

    // ── Cake orders (bakery production feed) ──────────────────────────────────
    { matcher: "/admin/cake-orders", methods: ["GET"], middlewares: [userAuth] },

    // ── Product reviews (moderation queue) ────────────────────────────────────
    { matcher: "/admin/product-reviews", methods: ["GET"], middlewares: [userAuth] },
    { matcher: "/admin/product-reviews/:id", methods: ["POST"], middlewares: [userAuth] },

    // ── Order scoping ─────────────────────────────────────────────────────────
    {
      matcher: "/admin/orders",
      methods: ["GET"],
      middlewares: [userAuth, scopeFranchiseOrderList, scopeStoreOrderList],
    },
    {
      matcher: "/admin/orders/:id",
      methods: ["GET", "POST", "PUT", "DELETE"],
      middlewares: [userAuth, guardFranchiseOrderSingleResource, guardStoreOrderSingleResource],
    },
    {
      matcher: "/admin/orders/:id/*",
      methods: ["GET", "POST", "PUT", "DELETE"],
      middlewares: [userAuth, guardFranchiseOrderSingleResource, guardStoreOrderSingleResource],
    },

    // ── Returns / Exchanges / Claims / Draft Orders / Payment Collections ─────
    { matcher: "/admin/returns",                    middlewares: [userAuth, scopeFranchiseReturns] },
    { matcher: "/admin/returns/:id",                middlewares: [userAuth, scopeFranchiseReturns] },
    { matcher: "/admin/returns/:id/*",              middlewares: [userAuth, scopeFranchiseReturns] },
    { matcher: "/admin/exchanges",                  middlewares: [userAuth, scopeFranchiseExchanges] },
    { matcher: "/admin/exchanges/:id",              middlewares: [userAuth, scopeFranchiseExchanges] },
    { matcher: "/admin/exchanges/:id/*",            middlewares: [userAuth, scopeFranchiseExchanges] },
    { matcher: "/admin/claims",                     middlewares: [userAuth, scopeFranchiseClaims] },
    { matcher: "/admin/claims/:id",                 middlewares: [userAuth, scopeFranchiseClaims] },
    { matcher: "/admin/claims/:id/*",               middlewares: [userAuth, scopeFranchiseClaims] },
    { matcher: "/admin/draft-orders",               middlewares: [userAuth, scopeFranchiseDraftOrders] },
    { matcher: "/admin/draft-orders/:id",           middlewares: [userAuth, scopeFranchiseDraftOrders] },
    { matcher: "/admin/draft-orders/:id/*",         middlewares: [userAuth, scopeFranchiseDraftOrders] },
    { matcher: "/admin/payment-collections",        middlewares: [userAuth, scopeFranchisePaymentCollections] },
    { matcher: "/admin/payment-collections/:id",    middlewares: [userAuth, scopeFranchisePaymentCollections] },
    { matcher: "/admin/payment-collections/:id/*",  middlewares: [userAuth, scopeFranchisePaymentCollections] },

    // ── Sales Channels scoping ────────────────────────────────────────────────
    { matcher: "/admin/sales-channels",        methods: ["GET", "POST"],           middlewares: [userAuth, filterAdminSalesChannelsByFranchise] },
    { matcher: "/admin/sales-channels/:id",    methods: ["GET", "POST", "DELETE"], middlewares: [userAuth, filterAdminSalesChannelsByFranchise] },
    { matcher: "/admin/sales-channels/:id/*",  methods: ["GET", "POST", "PUT", "DELETE"], middlewares: [userAuth, filterAdminSalesChannelsByFranchise] },

    // ── Stock Locations scoping ───────────────────────────────────────────────
    { matcher: "/admin/stock-locations",       methods: ["GET", "POST"],           middlewares: [userAuth, filterAdminStockLocationsByFranchise] },
    { matcher: "/admin/stock-locations/:id",   methods: ["GET", "POST", "DELETE"], middlewares: [userAuth, filterAdminStockLocationsByFranchise] },
    { matcher: "/admin/stock-locations/:id/*", methods: ["GET", "POST", "PUT", "DELETE"], middlewares: [userAuth, filterAdminStockLocationsByFranchise] },

    // ── Inventory Items scoping ───────────────────────────────────────────────
    { matcher: "/admin/inventory-items",       middlewares: [userAuth, filterAdminInventoryByFranchise] },
    { matcher: "/admin/inventory-items/:id",   middlewares: [userAuth, filterAdminInventoryByFranchise] },
    { matcher: "/admin/inventory-items/:id/*", middlewares: [userAuth, filterAdminInventoryByFranchise] },

    // ── Reservations scoping ──────────────────────────────────────────────────
    { matcher: "/admin/reservations",    middlewares: [userAuth, filterAdminReservationsByFranchise] },
    { matcher: "/admin/reservations/:id",middlewares: [userAuth, filterAdminReservationsByFranchise] },

    // ── Customers scoping ─────────────────────────────────────────────────────
    { matcher: "/admin/customers",       middlewares: [userAuth, filterAdminCustomersByFranchise] },
    { matcher: "/admin/customers/:id",   middlewares: [userAuth, filterAdminCustomersByFranchise] },
    { matcher: "/admin/customers/:id/*", middlewares: [userAuth, filterAdminCustomersByFranchise] },

    // ── Uploads — franchise admins cannot delete ───────────────────────────────
    { matcher: "/admin/uploads",    methods: UPLOAD_BLOCKED_METHODS, middlewares: [userAuth, blockFranchiseAdminMutations] },
    { matcher: "/admin/uploads/:id",methods: UPLOAD_BLOCKED_METHODS, middlewares: [userAuth, blockFranchiseAdminMutations] },

    // ── Resource-level read-only / fully-blocked policies ─────────────────────
    // Generated from RESTRICTED_RESOURCES config table above.
    ...buildRestrictedRoutes(),
  ],
})
