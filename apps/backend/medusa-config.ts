import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const REDIS_URL = process.env.REDIS_URL

// Medusa enables Postgres SSL by default when NODE_ENV=production. A local /
// Docker Postgres (e.g. postgres:16-alpine) does NOT support SSL, so the driver
// would loop forever on "The server does not support SSL connections".
// Default to SSL OFF; opt in with DATABASE_SSL=true for managed cloud DBs.
const DATABASE_SSL = process.env.DATABASE_SSL === "true"

// With NODE_ENV=production Medusa marks session cookies Secure + SameSite=None,
// which browsers silently drop over plain HTTP — admin login then 401s on
// /admin/users/me. The local Docker stack serves http://localhost:9000, so it
// sets COOKIE_SECURE=false to keep cookies working; real HTTPS deployments
// must leave it unset. (SameSite=None requires Secure, hence "lax" here.)
const INSECURE_COOKIES = process.env.COOKIE_SECURE === "false"

// Admin dashboard toggle.
//
// Setting MEDUSA_DISABLE_ADMIN=true prevents Medusa from registering the /app/*
// Express route entirely. When omitted, the dashboard is served at /app/ by
// default so that `localhost:9000/app/` works in development instead of
// returning a 404 with a restrictive Content-Security-Policy (which also blocks
// Chrome DevTools from probing /.well-known/appspecific/com.chrome.devtools.json
// on that origin).
//
// Production / Docker deployments set MEDUSA_DISABLE_ADMIN=true in .env.docker
// to skip the bundle serve overhead.
const DISABLE_ADMIN = process.env.MEDUSA_DISABLE_ADMIN === "true"

// The "supersecret" fallbacks below are a dev-only convenience. In production
// they would let anyone forge admin JWTs / tamper with session cookies, so we
// refuse to boot rather than fall back silently.
if (process.env.NODE_ENV === "production") {
  const missingSecrets = ["JWT_SECRET", "COOKIE_SECRET"].filter(
    (name) => !process.env[name]
  )
  if (missingSecrets.length) {
    throw new Error(
      `Refusing to start in production without ${missingSecrets.join(" and ")}. ` +
        `Set the missing environment variable(s) to strong random values — ` +
        `falling back to the built-in default would allow anyone to forge ` +
        `authentication tokens.`
    )
  }
}

// Project modules. Typed as a plain record so the object-form `modules`
// overload of defineConfig resolves cleanly when we add entries below.
const modules: Record<string, any> = {
  franchise: {
    resolve: "./src/modules/franchise",
  },
  dietary_tag: {
    resolve: "./src/modules/dietary_tag",
  },
  product_review: {
    resolve: "./src/modules/product_review",
  },
  inbound_lead: {
    resolve: "./src/modules/inbound_lead",
  },
}

// ── Payment providers ────────────────────────────────────────────────────────
// PayPal (via @alphabite/medusa-paypal) is only registered when credentials are
// present: the provider's validateOptions() throws on an empty clientId, which
// would prevent the backend from booting in environments that haven't set up
// PayPal yet. The built-in pp_system_default provider is always registered by
// the payment module itself, so "pay on collection" keeps working either way.
const paymentProviders: Record<string, any>[] = []

if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
  if (!process.env.PAYPAL_RETURN_URL || !process.env.PAYPAL_CANCEL_URL) {
    throw new Error(
      "PayPal requires both PAYPAL_RETURN_URL and PAYPAL_CANCEL_URL. " +
        "Without them the provider falls back to Smart Buttons, which this storefront does not use."
    )
  }
  paymentProviders.push({
    // Platform-owned provider (see src/modules/paypal/README.md).
    // Product path = full-page PayPal redirect. Both URLs are required: a
    // partial configuration silently falls back to Smart Buttons and brings
    // back the popup loading failure this flow is designed to avoid.
    // Amounts are Medusa-native major units platform-wide.
    resolve: "./src/modules/paypal",
    id: "paypal", // -> resolves to provider id "pp_paypal_paypal"
    options: {
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      isSandbox: process.env.PAYPAL_IS_SANDBOX === "true",
      // Cake Break is collection-first; don't push address data to PayPal.
      includeShippingData: false,
      includeCustomerData: false,
      // Redirect mode requires both URLs. Deployment config must set both.
      ...(process.env.PAYPAL_RETURN_URL && {
        returnUrl: process.env.PAYPAL_RETURN_URL,
      }),
      ...(process.env.PAYPAL_CANCEL_URL && {
        cancelUrl: process.env.PAYPAL_CANCEL_URL,
      }),
    },
  })
} else {
  console.warn(
    "[medusa-config] PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set — " +
      "PayPal payment provider disabled (pp_system_default remains available)."
  )
}

if (paymentProviders.length) {
  modules[Modules.PAYMENT] = {
    resolve: "@medusajs/medusa/payment",
    options: {
      providers: paymentProviders,
    },
  }
}

// Fulfillment: keep Medusa's manual provider (flat rates / pickup) and add the
// Cake Break calculated local-delivery provider so shipping_total matches the
// backend delivery-fee maths (not a UI-only metadata patch).
modules[Modules.FULFILLMENT] = {
  resolve: "@medusajs/medusa/fulfillment",
  options: {
    providers: [
      {
        resolve: "@medusajs/medusa/fulfillment-manual",
        id: "manual",
      },
      {
        resolve: "./src/modules/cake-fulfillment",
        id: "cake", // → provider id "cake_cake"
      },
    ],
  },
}

// When REDIS_URL is set (Docker / production) wire the cache, event bus and
// workflow engine to Redis. Otherwise Medusa falls back to its in-memory
// defaults so local dev works without a running Redis instance.
if (REDIS_URL) {
  modules[Modules.CACHE] = {
    resolve: "@medusajs/cache-redis",
    options: { redisUrl: REDIS_URL },
  }
  modules[Modules.EVENT_BUS] = {
    resolve: "@medusajs/event-bus-redis",
    options: { redisUrl: REDIS_URL },
  }
  modules[Modules.WORKFLOW_ENGINE] = {
    resolve: "@medusajs/workflow-engine-redis",
    options: {
      redis: {
        url: REDIS_URL,
      },
    },
  }

}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: {
      connection: {
        ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false,
      },
    },
    // Used by Medusa for session storage when present.
    redisUrl: REDIS_URL,
    // Spread last onto express-session's cookie config, so this overrides the
    // Secure/SameSite=None defaults that NODE_ENV=production switches on.
    ...(INSECURE_COOKIES && {
      cookieOptions: {
        secure: false,
        sameSite: "lax",
      },
    }),
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  admin: {
    // Controlled via MEDUSA_DISABLE_ADMIN env var.
    // In dev: admin runs at /app/ (leave MEDUSA_DISABLE_ADMIN unset).
    // In Docker/prod: set MEDUSA_DISABLE_ADMIN=true to skip the dashboard.
    disable: DISABLE_ADMIN,
  },
  modules,
})
