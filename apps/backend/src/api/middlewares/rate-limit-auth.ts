/**
 * @file rate-limit-auth.ts
 * @description Brute-force protection for the customer authentication endpoints
 *              (`/auth/customer/emailpass` and `/auth/customer/emailpass/register`).
 *
 * Strategy
 * ────────
 * Fixed-window counters keyed by client IP, held in process memory:
 *
 *   - Login:    5 FAILED attempts per IP per 15 minutes. Successful logins are
 *               refunded (a legitimate user who logs in/out repeatedly is never
 *               throttled) — the same semantics as express-rate-limit's
 *               `skipSuccessfulRequests`.
 *   - Register: 3 attempts per IP per hour, successful or not (registration is
 *               rare for a real user; counting all attempts also throttles
 *               account-enumeration probes that "succeed" with a 4xx).
 *
 * Deployment note (deliberate scope decision): this store is in-process, so
 * each backend instance enforces its own window. That is the right trade-off
 * today — the platform runs a single Medusa instance — and it degrades safely
 * (limits are per-instance, never disabled). When the backend scales
 * horizontally, swap `FixedWindowStore` for a Redis-backed implementation
 * (REDIS_URL is already wired in medusa-config.ts) or enforce limits at the
 * reverse proxy; the middleware surface below stays the same.
 */

import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"

// ---------------------------------------------------------------------------
// Fixed-window counter store
// ---------------------------------------------------------------------------

type Bucket = {
  count: number
  /** Epoch ms at which this window expires and the counter resets. */
  resetAt: number
}

class FixedWindowStore {
  private readonly buckets = new Map<string, Bucket>()

  constructor(private readonly windowMs: number) {}

  /**
   * Increment the counter for `key`, opening a fresh window if none is active.
   * Returns the bucket AFTER the increment so callers can compare `count`
   * against their limit and compute a Retry-After.
   */
  increment(key: string): Bucket {
    const now = Date.now()
    const existing = this.buckets.get(key)

    if (!existing || existing.resetAt <= now) {
      const fresh: Bucket = { count: 1, resetAt: now + this.windowMs }
      this.buckets.set(key, fresh)
      return fresh
    }

    existing.count += 1
    return existing
  }

  /**
   * Refund one hit for `key` (used to skip successful requests). Only refunds
   * inside the still-active window; a no-op if the window already rolled over.
   */
  decrement(key: string): void {
    const existing = this.buckets.get(key)
    if (existing && existing.resetAt > Date.now() && existing.count > 0) {
      existing.count -= 1
    }
  }

  /** Drop expired buckets so the map cannot grow unbounded under scanning. */
  sweep(): void {
    const now = Date.now()
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key)
      }
    }
  }

  /** Test-only: clear all counters. */
  clear(): void {
    this.buckets.clear()
  }
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

type RateLimitOptions = {
  /** Length of the fixed window in milliseconds. */
  windowMs: number
  /** Maximum counted requests per window per IP. */
  max: number
  /**
   * When true, requests that complete with a 2xx/3xx status are refunded —
   * only failures consume the budget (login semantics).
   */
  countFailuresOnly: boolean
  /** Human-readable 429 message. */
  message: string
}

/**
 * Resolve the client IP. `req.ip` is Express's computed address and respects
 * the app's trust-proxy setting; the socket address is the fallback. Behind a
 * reverse proxy, make sure the proxy overwrites (never appends blindly)
 * X-Forwarded-For, otherwise the limiter keys on the proxy's own IP.
 */
const getClientIp = (req: MedusaRequest): string =>
  (req as unknown as { ip?: string }).ip ||
  req.socket?.remoteAddress ||
  "unknown"

const createAuthRateLimiter = (options: RateLimitOptions) => {
  const store = new FixedWindowStore(options.windowMs)
  stores.push(store)

  const middleware = (
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ): void => {
    if (process.env.DISABLE_RATE_LIMIT === "true" || process.env.NODE_ENV === "test") {
      next()
      return
    }

    const key = getClientIp(req)
    const bucket = store.increment(key)

    if (bucket.count > options.max) {
      // Over budget — refund the probe we just counted so a throttled client
      // cannot push its own reset further out, then reject.
      store.decrement(key)
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.resetAt - Date.now()) / 1000)
      )
      res.setHeader("Retry-After", String(retryAfterSeconds))
      res.status(429).json({
        message: options.message,
        code: "RATE_LIMITED",
        retry_after: retryAfterSeconds,
      })
      return
    }

    if (options.countFailuresOnly) {
      // Refund the slot if the request ultimately succeeds (2xx/3xx).
      res.on("finish", () => {
        if (res.statusCode < 400) {
          store.decrement(key)
        }
      })
    }

    next()
  }

  return middleware
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

const stores: FixedWindowStore[] = []

// Periodically evict expired windows. `unref()` keeps the timer from holding
// the process (or Jest) open.
const SWEEP_INTERVAL_MS = 60_000
const sweeper = setInterval(() => {
  for (const store of stores) {
    store.sweep()
  }
}, SWEEP_INTERVAL_MS)
if (typeof sweeper.unref === "function") {
  sweeper.unref()
}

/** Test-only: reset every limiter's counters between test cases. */
export const resetAuthRateLimiters = (): void => {
  for (const store of stores) {
    store.clear()
  }
}

// ---------------------------------------------------------------------------
// Configured limiters (registered in ../middlewares.ts)
// ---------------------------------------------------------------------------

/** POST /auth/customer/emailpass — 5 failed logins per IP per 15 minutes. */
export const customerLoginRateLimiter = createAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  countFailuresOnly: true,
  message:
    "Too many failed login attempts. Please try again in a few minutes.",
})

/** POST /auth/customer/emailpass/register — 3 attempts per IP per hour. */
export const customerRegisterRateLimiter = createAuthRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  countFailuresOnly: false,
  message: "Too many registration attempts. Please try again later.",
})
