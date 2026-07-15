/**
 * Unit tests for the customer-auth rate limiter (rate-limit-auth.ts).
 *
 * The limiter instances are module-level singletons, so every test resets them
 * via resetAuthRateLimiters() and controls time by spying on Date.now — no real
 * timers are needed (the sweeper interval is unref'd and irrelevant here).
 */
import {
  customerLoginRateLimiter,
  customerRegisterRateLimiter,
  resetAuthRateLimiters,
} from "../middlewares/rate-limit-auth"

type MockRes = {
  statusCode: number
  headers: Record<string, string>
  body?: unknown
  setHeader: (k: string, v: string) => void
  status: (code: number) => MockRes
  json: (body: unknown) => MockRes
  on: (event: string, cb: () => void) => void
  /** Simulate Express finishing the response with the given status. */
  emitFinish: (statusCode: number) => void
}

const makeReq = (ip = "203.0.113.7") =>
  ({ ip, socket: { remoteAddress: ip } }) as any

const makeRes = (): MockRes => {
  const listeners: Array<() => void> = []
  const res: MockRes = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) {
      res.headers[k] = v
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(body) {
      res.body = body
      return res
    },
    on(event, cb) {
      if (event === "finish") listeners.push(cb)
    },
    emitFinish(statusCode) {
      res.statusCode = statusCode
      listeners.forEach((cb) => cb())
    },
  }
  return res
}

/** Run the middleware once; returns { res, passed } for assertion. */
const hit = (
  limiter: typeof customerLoginRateLimiter,
  ip: string,
  finishStatus?: number
) => {
  const res = makeRes()
  let passed = false
  limiter(makeReq(ip), res as any, (() => {
    passed = true
  }) as any)
  if (passed && finishStatus !== undefined) {
    res.emitFinish(finishStatus)
  }
  return { res, passed }
}

let nowSpy: jest.SpyInstance<number, []>
let now = 1_700_000_000_000

beforeEach(() => {
  resetAuthRateLimiters()
  now = 1_700_000_000_000
  nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now)
})

afterEach(() => {
  nowSpy.mockRestore()
})

describe("customerLoginRateLimiter (5 failures / 15 min, failures only)", () => {
  it("allows up to 5 failed attempts, rejects the 6th with 429 + Retry-After", () => {
    for (let i = 0; i < 5; i++) {
      const { passed } = hit(customerLoginRateLimiter, "10.0.0.1", 401)
      expect(passed).toBe(true)
    }

    const { res, passed } = hit(customerLoginRateLimiter, "10.0.0.1")
    expect(passed).toBe(false)
    expect(res.statusCode).toBe(429)
    expect((res.body as any).code).toBe("RATE_LIMITED")
    expect(Number(res.headers["Retry-After"])).toBeGreaterThan(0)
    expect(Number(res.headers["Retry-After"])).toBeLessThanOrEqual(15 * 60)
  })

  it("refunds successful logins so they never consume the failure budget", () => {
    // 10 successful logins in a row — far more than the failure limit.
    for (let i = 0; i < 10; i++) {
      const { passed } = hit(customerLoginRateLimiter, "10.0.0.2", 200)
      expect(passed).toBe(true)
    }
    // The full failure budget must still be available afterwards.
    for (let i = 0; i < 5; i++) {
      const { passed } = hit(customerLoginRateLimiter, "10.0.0.2", 401)
      expect(passed).toBe(true)
    }
    expect(hit(customerLoginRateLimiter, "10.0.0.2").passed).toBe(false)
  })

  it("resets the budget once the 15-minute window expires", () => {
    for (let i = 0; i < 5; i++) {
      hit(customerLoginRateLimiter, "10.0.0.3", 401)
    }
    expect(hit(customerLoginRateLimiter, "10.0.0.3").passed).toBe(false)

    now += 15 * 60 * 1000 + 1

    const { passed } = hit(customerLoginRateLimiter, "10.0.0.3", 401)
    expect(passed).toBe(true)
  })

  it("does not extend the throttled client's own window on rejected probes", () => {
    for (let i = 0; i < 5; i++) {
      hit(customerLoginRateLimiter, "10.0.0.4", 401)
    }
    // Hammering while throttled must not push the reset further out.
    for (let i = 0; i < 20; i++) {
      expect(hit(customerLoginRateLimiter, "10.0.0.4").passed).toBe(false)
    }
    now += 15 * 60 * 1000 + 1
    expect(hit(customerLoginRateLimiter, "10.0.0.4", 401).passed).toBe(true)
  })

  it("tracks each client IP independently", () => {
    for (let i = 0; i < 5; i++) {
      hit(customerLoginRateLimiter, "10.0.0.5", 401)
    }
    expect(hit(customerLoginRateLimiter, "10.0.0.5").passed).toBe(false)
    expect(hit(customerLoginRateLimiter, "10.0.0.6", 401).passed).toBe(true)
  })
})

describe("customerRegisterRateLimiter (3 attempts / hour, all attempts)", () => {
  it("counts successful registrations too and rejects the 4th attempt", () => {
    for (let i = 0; i < 3; i++) {
      const { passed } = hit(customerRegisterRateLimiter, "10.1.0.1", 200)
      expect(passed).toBe(true)
    }

    const { res, passed } = hit(customerRegisterRateLimiter, "10.1.0.1")
    expect(passed).toBe(false)
    expect(res.statusCode).toBe(429)
    expect((res.body as any).code).toBe("RATE_LIMITED")
  })

  it("resets after the 1-hour window", () => {
    for (let i = 0; i < 3; i++) {
      hit(customerRegisterRateLimiter, "10.1.0.2", 200)
    }
    expect(hit(customerRegisterRateLimiter, "10.1.0.2").passed).toBe(false)

    now += 60 * 60 * 1000 + 1

    expect(hit(customerRegisterRateLimiter, "10.1.0.2", 200).passed).toBe(true)
  })
})
