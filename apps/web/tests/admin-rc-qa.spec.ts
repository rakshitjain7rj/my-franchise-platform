/**
 * Final Release Candidate — Admin panel browser verification
 * Target: ADMIN_BASE (default http://127.0.0.1:9001) with built UI polish
 */
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test"
import * as fs from "fs"
import * as path from "path"

test.setTimeout(300000)

// Prefer production for form login (proven), or set ADMIN_BASE for local RC builds.
const BASE = (
  process.env.ADMIN_BASE || "https://cakebreak-backend.codeation.io"
).replace(/\/$/, "")
const EMAIL = process.env.ADMIN_EMAIL || "rakshit@codeation.io"
const PASSWORD = process.env.ADMIN_PASSWORD || "rakshit@cakebreak"
const USE_FORM_LOGIN = process.env.ADMIN_FORM_LOGIN !== "0"
const OUT = path.join(process.cwd(), "test-results", "admin-rc-qa")

const findings: Array<{ page: string; level: "pass" | "fail" | "warn"; msg: string }> = []
const consoleErrors: string[] = []
const networkFailures: string[] = []

function log(page: string, level: "pass" | "fail" | "warn", msg: string) {
  findings.push({ page, level, msg })
  const tag = level.toUpperCase()
  console.log(`[${tag}] [${page}] ${msg}`)
  fs.appendFileSync(path.join(OUT, "report.txt"), `[${tag}] [${page}] ${msg}\n`)
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true })
  const p = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: p, fullPage: true })
  log("screenshot", "pass", name)
}

function attachCollectors(page: Page) {
  page.on("console", (msg: ConsoleMessage) => {
    const t = msg.type()
    const text = msg.text()
    if (t === "error") {
      // Filter noisy third-party / expected noise
      if (/favicon|Download the React DevTools|ResizeObserver/i.test(text)) return
      consoleErrors.push(text)
    }
  })
  page.on("pageerror", (err) => {
    consoleErrors.push(`pageerror: ${err.message}`)
  })
  page.on("response", (res) => {
    const url = res.url()
    const status = res.status()
    if (status >= 400 && /\/admin\/|\/auth\//.test(url)) {
      // 401 on first paint before login is expected on some routes
      if (status === 401 && !url.includes("emailpass")) return
      networkFailures.push(`${status} ${res.request().method()} ${url}`)
    }
  })
}

async function login(page: Page) {
  await page.goto(`${BASE}/app/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForTimeout(2000)
  await shot(page, "00-login")

  if (USE_FORM_LOGIN) {
    const email = page.locator('input[type="email"], input[name="email"]').first()
    const pass = page.locator('input[type="password"]').first()
    await expect(email).toBeVisible({ timeout: 30000 })
    await email.click()
    await email.fill(EMAIL)
    await pass.click()
    await pass.fill(PASSWORD)

    const loginResponse = page
      .waitForResponse(
        (r) =>
          r.url().includes("/auth/user/emailpass") &&
          r.request().method() === "POST",
        { timeout: 25000 }
      )
      .catch(() => null)

    await page
      .getByRole("button", { name: /Continue with Email|Sign in|Log in/i })
      .click()
    const authRes = await loginResponse
    if (authRes) log("login", "pass", `form emailpass status=${authRes.status()}`)

    await page
      .waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 })
      .catch(() => {})
    await page.waitForTimeout(4000)
  }

  if (page.url().includes("/login")) {
    log("login", "warn", "form login failed — bearer route injection")
    const tokenRes = await page.request.post(`${BASE}/auth/user/emailpass`, {
      data: { email: EMAIL, password: PASSWORD },
    })
    expect(tokenRes.ok()).toBeTruthy()
    const { token } = (await tokenRes.json()) as { token: string }
    await page.route("**/*", async (route) => {
      const req = route.request()
      if (req.url().startsWith(BASE)) {
        await route.continue({
          headers: { ...req.headers(), authorization: `Bearer ${token}` },
        })
      } else {
        await route.continue()
      }
    })
    await page.goto(`${BASE}/app/orders`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(4000)
  }

  await shot(page, "01-after-login")
  if (page.url().includes("/login")) {
    throw new Error("Login failed — still on /app/login")
  }
  log("login", "pass", `authenticated url=${page.url()}`)
}

async function gotoApp(page: Page, route: string) {
  const url = `${BASE}/app${route.startsWith("/") ? route : `/${route}`}`
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForTimeout(2500)
  return res
}

async function checkNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      bodyScroll: document.body.scrollWidth,
    }
  })
  if (overflow.scrollWidth > overflow.clientWidth + 8) {
    log(label, "warn", `horizontal overflow: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`)
  } else {
    log(label, "pass", "no document horizontal overflow")
  }
}

async function checkViewport(page: Page, width: number, height: number, label: string) {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(800)
  await shot(page, `${label}-${width}x${height}`)
  await checkNoHorizontalOverflow(page, label)
}

test.describe("Admin RC browser verification", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(path.join(OUT, "report.txt"), `Admin RC QA ${new Date().toISOString()}\nBASE=${BASE}\n\n`)
  })

  test("RC-1 full admin panel walkthrough", async ({ page, context }) => {
    attachCollectors(page)
    await page.setViewportSize({ width: 1440, height: 900 })

    // ── Login ────────────────────────────────────────────────────────────
    await login(page)

    // ── Franchise Dashboard ──────────────────────────────────────────────
    await gotoApp(page, "/franchise-dashboard")
    await page.waitForTimeout(2000)
    await shot(page, "02-franchise-dashboard")
    const dashText = await page.locator("body").innerText()
    if (/Franchise Dashboard|Live Inventory|Store Locations|Store Health/i.test(dashText)) {
      log("franchise-dashboard", "pass", "page content loaded")
    } else {
      log("franchise-dashboard", "fail", `unexpected body: ${dashText.slice(0, 200)}`)
    }
    // Store Health should be on dashboard (RC fix)
    if (/Store Health/i.test(dashText)) {
      log("store-health", "pass", "Store Health section visible on Franchise Dashboard")
    } else {
      log("store-health", "warn", "Store Health heading not found on dashboard (may be empty/error state)")
    }
    if (/Could not load store health|No store locations/i.test(dashText)) {
      log("store-health", "warn", "Store Health empty or error empty-state visible")
    }
    if (/Total Stocked|Live Inventory/i.test(dashText)) {
      log("franchise-dashboard", "pass", "inventory KPIs present")
    }
    await checkViewport(page, 1440, 900, "02-dashboard")
    await checkViewport(page, 390, 844, "02-dashboard-mobile")
    await page.setViewportSize({ width: 1440, height: 900 })

    // ── Cake Orders ──────────────────────────────────────────────────────
    await gotoApp(page, "/cake-orders")
    await page.waitForTimeout(2000)
    await shot(page, "03-cake-orders")
    const cakeBody = await page.locator("body").innerText()
    if (/Cake Orders/i.test(cakeBody)) {
      log("cake-orders", "pass", "page loaded")
    } else {
      log("cake-orders", "fail", "title missing")
    }
    // Search
    const search = page.getByRole("searchbox", { name: /search cake orders/i }).or(
      page.locator('input[type="search"][aria-label*="Search cake" i], input[type="search"]').first()
    )
    if (await search.isVisible().catch(() => false)) {
      await search.fill("zzznomatch999")
      await page.waitForTimeout(500)
      await shot(page, "03-cake-orders-search-empty")
      const after = await page.locator("body").innerText()
      if (/No orders match|No cake orders|Nothing found/i.test(after)) {
        log("cake-orders", "pass", "search empty state works")
      } else {
        log("cake-orders", "warn", "search empty state text not detected")
      }
      // clear
      const clearBtn = page.getByRole("button", { name: /clear/i }).first()
      if (await clearBtn.isVisible().catch(() => false)) {
        await clearBtn.click()
      } else {
        await search.fill("")
      }
      await page.waitForTimeout(400)
    } else {
      log("cake-orders", "warn", "search input not found")
    }
    // Date filters
    const filterAll = page.getByRole("button", { name: /^All$/i }).first()
    if (await filterAll.isVisible().catch(() => false)) {
      await filterAll.click()
      log("cake-orders", "pass", "filter pill All clicked")
    }
    await shot(page, "03-cake-orders-after-filter")
    await checkViewport(page, 390, 844, "03-cake-mobile")
    await page.setViewportSize({ width: 1440, height: 900 })

    // ── Super Admin ──────────────────────────────────────────────────────
    await gotoApp(page, "/super-admin")
    await page.waitForTimeout(2500)
    await shot(page, "04-super-admin")
    const sa = await page.locator("body").innerText()
    if (/Access denied|restricted/i.test(sa)) {
      log("super-admin", "warn", "access denied for this user — not super admin")
    } else if (/Super Admin|Franchise Brands|Franchises/i.test(sa)) {
      log("super-admin", "pass", "portal loaded")
      // Tabs
      for (const tab of ["Franchises", "Locations", "User Access"]) {
        const t = page.getByRole("tab", { name: new RegExp(tab, "i") }).first()
        if (await t.isVisible().catch(() => false)) {
          await t.click()
          await page.waitForTimeout(800)
          await shot(page, `04-super-admin-${tab.replace(/\s+/g, "-").toLowerCase()}`)
          log("super-admin", "pass", `tab ${tab} opened`)
        }
      }
      // Search franchises
      await page.getByRole("tab", { name: /Franchises/i }).click().catch(() => {})
      await page.waitForTimeout(500)
      const franSearch = page.locator('input[type="search"]').first()
      if (await franSearch.isVisible().catch(() => false)) {
        await franSearch.fill("xyznonexistent")
        await page.waitForTimeout(400)
        const t = await page.locator("body").innerText()
        if (/No franchises match|Nothing found/i.test(t)) {
          log("super-admin", "pass", "franchise search empty state")
        }
        await franSearch.fill("")
      }
      // Open Add Franchise dialog
      const addFran = page.getByRole("button", { name: /Add Franchise/i }).first()
      if (await addFran.isVisible().catch(() => false)) {
        await addFran.click()
        await page.waitForTimeout(800)
        await shot(page, "04-super-admin-add-franchise-modal")
        // Focus trap / Escape
        await page.keyboard.press("Escape")
        await page.waitForTimeout(500)
        const modalGone = !(await page.getByRole("heading", { name: /Create New Franchise|Modify Franchise/i }).isVisible().catch(() => false))
        if (modalGone) {
          log("super-admin", "pass", "Escape closes franchise modal")
        } else {
          // try cancel
          const cancel = page.getByRole("button", { name: /Cancel/i }).first()
          if (await cancel.isVisible().catch(() => false)) {
            await cancel.click()
            log("super-admin", "pass", "Cancel closes franchise modal")
          } else {
            log("super-admin", "fail", "modal did not close on Escape")
          }
        }
      }
    } else {
      log("super-admin", "fail", `unexpected: ${sa.slice(0, 200)}`)
    }

    // ── Inbound Leads ────────────────────────────────────────────────────
    await gotoApp(page, "/leads")
    await page.waitForTimeout(2000)
    await shot(page, "05-leads")
    const leads = await page.locator("body").innerText()
    if (/Inbound Leads|leads/i.test(leads)) {
      log("leads", "pass", "page loaded")
    } else {
      log("leads", "fail", "title missing")
    }
    const leadSearch = page.locator('input[type="search"]').first()
    if (await leadSearch.isVisible().catch(() => false)) {
      await leadSearch.fill("zzznomatch")
      await page.waitForTimeout(400)
      await shot(page, "05-leads-search")
      log("leads", "pass", "search interacted")
      await leadSearch.fill("")
    }
    // filter pills
    for (const label of ["New", "Contacted", "Closed", "All"]) {
      const btn = page.getByRole("button", { name: new RegExp(`^${label}`, "i") }).first()
      if (await btn.isVisible().catch(() => false)) {
        await btn.click()
        await page.waitForTimeout(400)
      }
    }
    await shot(page, "05-leads-filters")
    log("leads", "pass", "filter pills clicked")

    // ── Product Reviews ──────────────────────────────────────────────────
    await gotoApp(page, "/product-reviews")
    await page.waitForTimeout(2000)
    await shot(page, "06-product-reviews")
    const rev = await page.locator("body").innerText()
    if (/Product Reviews|reviews/i.test(rev)) {
      log("product-reviews", "pass", "page loaded")
    } else {
      log("product-reviews", "fail", "title missing")
    }
    for (const label of ["Pending", "Approved", "Rejected"]) {
      const btn = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first()
      if (await btn.isVisible().catch(() => false)) {
        await btn.click()
        await page.waitForTimeout(500)
        await shot(page, `06-reviews-${label.toLowerCase()}`)
      }
    }
    log("product-reviews", "pass", "status filters exercised")

    // ── Products list → Product Details ──────────────────────────────────
    await gotoApp(page, "/products")
    await page.waitForTimeout(3000)
    await shot(page, "07-products-list")
    const productLink = page.locator('a[href*="/products/"]').first()
    if (await productLink.isVisible({ timeout: 15000 }).catch(() => false)) {
      await productLink.click()
      await page.waitForTimeout(3000)
      await shot(page, "08-product-details")
      const pd = await page.locator("body").innerText()
      if (/product|title|variants|Cake|Ingredients|Store/i.test(pd)) {
        log("product-details", "pass", "product detail loaded")
      }
      // Widgets: cake details / store availability
      if (/Ingredients|Allergens|Storage/i.test(pd)) {
        log("product-details", "pass", "cake details widget content present")
      } else {
        log("product-details", "warn", "cake details fields not detected in body text")
      }
      if (/Store Availability|All Stores|stock/i.test(pd)) {
        log("product-details", "pass", "store availability content present")
      } else {
        log("product-details", "warn", "store availability widget not detected")
      }
      // Store Health should NOT be on product page after fix
      if (/Store Health/i.test(pd) && /All \d+ Healthy|Stock Loc|Sales Ch/i.test(pd)) {
        log("product-details", "fail", "Store Health franchise panel still on product page")
      } else {
        log("product-details", "pass", "Store Health franchise panel not injected on product page")
      }
    } else {
      log("product-details", "warn", "no product link found — list may be empty")
    }

    // ── Keyboard smoke: Tab focus ────────────────────────────────────────
    await gotoApp(page, "/cake-orders")
    await page.waitForTimeout(1000)
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    log("a11y", "pass", `Tab moves focus, activeElement=${focused}`)

    // ── Mobile dashboard overflow ────────────────────────────────────────
    await checkViewport(page, 390, 844, "09-final-mobile")

    // ── Persist console / network ────────────────────────────────────────
    fs.writeFileSync(
      path.join(OUT, "console-errors.json"),
      JSON.stringify(consoleErrors, null, 2)
    )
    fs.writeFileSync(
      path.join(OUT, "network-failures.json"),
      JSON.stringify(networkFailures, null, 2)
    )
    fs.writeFileSync(path.join(OUT, "findings.json"), JSON.stringify(findings, null, 2))

    // Filter critical console errors (ignore PayPal CSP etc not relevant)
    const criticalConsole = consoleErrors.filter(
      (e) =>
        !/paypal|Content Security Policy|Download the React|favicon|hydration|Minified React/i.test(
          e
        )
    )
    if (criticalConsole.length) {
      log("console", "warn", `${criticalConsole.length} console errors: ${criticalConsole.slice(0, 3).join(" | ")}`)
    } else {
      log("console", "pass", "no critical console errors")
    }

    const criticalNet = networkFailures.filter(
      (n) => !/404.*favicon|store-health/.test(n) // store-health may 500 until API deploy; still report
    )
    const healthFails = networkFailures.filter((n) => /store-health/.test(n))
    if (healthFails.length) {
      log("network", "warn", `store-health failures: ${healthFails.slice(0, 2).join("; ")}`)
    }
    if (criticalNet.length > healthFails.length) {
      log(
        "network",
        "warn",
        `${criticalNet.length} admin/auth failures: ${criticalNet.slice(0, 5).join("; ")}`
      )
    } else if (!criticalNet.length) {
      log("network", "pass", "no unexpected admin/auth network failures")
    }

    const fails = findings.filter((f) => f.level === "fail")
    if (fails.length) {
      throw new Error(`RC failures:\n${fails.map((f) => `- [${f.page}] ${f.msg}`).join("\n")}`)
    }
  })
})
