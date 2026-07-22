/**
 * Production E2E QA — Cake Break live storefront
 * Target: https://cakebreak.codeation.io
 *
 * Flow: location → product → cart → checkout → PayPal sandbox → order confirmation
 * Env:
 *   PAYPAL_SANDBOX_EMAIL
 *   PAYPAL_SANDBOX_PASSWORD
 *   PROD_BASE_URL (optional, default production)
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

test.setTimeout(360000);

const BASE_URL = process.env.PROD_BASE_URL || "https://cakebreak.codeation.io";
const PAYPAL_EMAIL = process.env.PAYPAL_SANDBOX_EMAIL || "";
const PAYPAL_PASSWORD = process.env.PAYPAL_SANDBOX_PASSWORD || "";
const OUT_DIR = path.join(process.cwd(), "test-results", "prod-e2e-qa");

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.appendFileSync(path.join(OUT_DIR, "qa-log.txt"), line + "\n");
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage: true,
  });
  log(`screenshot: ${name}.png`);
}

async function clearOverlays(page: Page) {
  for (const sel of [
    "button:has-text('Not now')",
    "button:has-text('Dismiss install prompt')",
    "button:has-text('Accept all')",
    "button:has-text('Essential only')",
    "button:has-text('Got it')",
    "button:has-text('Close')",
  ]) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
    }
  }
}

async function collectConsole(page: Page, bag: string[]) {
  page.on("console", (msg) => {
    if (msg.type() === "error") bag.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => bag.push(`pageerror: ${err.message}`));
  page.on("response", (res) => {
    if (res.status() >= 400 && res.url().includes("codeation.io")) {
      bag.push(`http ${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
}

test.describe("Production QA — real shopper + PayPal sandbox", () => {
  test("P1 — full purchase: location → cake → checkout → PayPal → order id", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    await collectConsole(page, errors);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, "qa-log.txt"), "");

    log(`BASE_URL=${BASE_URL}`);
    expect(PAYPAL_EMAIL, "PAYPAL_SANDBOX_EMAIL required").toBeTruthy();
    expect(PAYPAL_PASSWORD, "PAYPAL_SANDBOX_PASSWORD required").toBeTruthy();

    // ── 1. Home ──────────────────────────────────────────────────────────
    log("STEP 1: open home");
    const homeRes = await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" });
    log(`home status=${homeRes?.status()}`);
    await clearOverlays(page);
    await shot(page, "01-home");
    await expect(page).toHaveTitle(/Cake Break/i);

    // ── 2. Map / location pick ───────────────────────────────────────────
    log("STEP 2: map-routing location pick");
    await page.goto(BASE_URL + "/map-routing", { waitUntil: "domcontentloaded" });
    await clearOverlays(page);
    await page.waitForTimeout(3000);
    await shot(page, "02-map-routing");

    // Prefer real production store buttons (Oldbury / Brierley / any select-location)
    const locationCandidates = [
      page.locator("button[id^='select-location-']").first(),
      page.locator("button:has-text('Oldbury')").first(),
      page.locator("button:has-text('Brierley')").first(),
      page.locator("button:has-text('Select')").first(),
      page.locator("button[aria-label*='Select']").first(),
    ];

    let picked = false;
    for (const loc of locationCandidates) {
      if (await loc.isVisible().catch(() => false)) {
        const label = (await loc.innerText().catch(() => "")) || "(location)";
        log(`clicking location: ${label.replace(/\s+/g, " ").trim()}`);
        await loc.click();
        picked = true;
        break;
      }
    }
    if (!picked) {
      await shot(page, "02-map-FAIL-no-location");
      throw new Error("Could not find a store location button on /map-routing");
    }

    // Wait for redirect home or catalogue
    await page.waitForTimeout(2000);
    await clearOverlays(page);
    log(`after location URL=${page.url()}`);
    await shot(page, "03-after-location");

    // ── 3. Open a product ────────────────────────────────────────────────
    log("STEP 3: open product");
    // If still on map, go home
    if (page.url().includes("map-routing")) {
      await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" });
      await clearOverlays(page);
    }

    let productLink = page.locator("a[href^='/products/']").first();
    if (!(await productLink.isVisible().catch(() => false))) {
      await page.goto(BASE_URL + "/cake-catalogue", { waitUntil: "domcontentloaded" });
      await clearOverlays(page);
      await page.waitForTimeout(2000);
      productLink = page.locator("a[href^='/products/']").first();
    }
    if (!(await productLink.isVisible().catch(() => false))) {
      await page.goto(BASE_URL + "/products", { waitUntil: "domcontentloaded" });
      await clearOverlays(page);
      await page.waitForTimeout(2000);
      productLink = page.locator("a[href^='/products/']").first();
    }

    await expect(productLink).toBeVisible({ timeout: 30000 });
    const productHref = await productLink.getAttribute("href");
    log(`product href=${productHref}`);
    await productLink.click();
    await page.waitForURL(/\/products\//, { timeout: 45000 });
    await clearOverlays(page);
    await page.waitForTimeout(2000);
    await shot(page, "04-product");

    // Collection date + time slot
    log("STEP 4: pick collection slot");
    const dateInput = page
      .locator('input[aria-label="Collection date"], input[type="date"]')
      .first();
    if (await dateInput.isVisible().catch(() => false)) {
      const minDate = await dateInput.getAttribute("min");
      const val = await dateInput.inputValue();
      if (!val && minDate) {
        await dateInput.fill(minDate);
        log(`filled collection date=${minDate}`);
      } else {
        log(`collection date already=${val}`);
      }
    } else {
      log("WARN: no collection date input visible");
    }

    const timeSlotBtn = page.locator('button[aria-label="Time slot"]');
    if (await timeSlotBtn.isVisible().catch(() => false)) {
      await expect(timeSlotBtn).toBeEnabled({ timeout: 25000 });
      const slotText = await timeSlotBtn.innerText();
      if (/Loading|No slots/i.test(slotText)) {
        await page.waitForTimeout(5000);
      }
      await timeSlotBtn.click();
      const firstSlot = page
        .locator('[role="listbox"][aria-label="Time slot"] [role="option"]')
        .first();
      if (await firstSlot.isVisible({ timeout: 15000 }).catch(() => false)) {
        const t = await firstSlot.innerText();
        log(`picked slot: ${t}`);
        await firstSlot.click();
      } else {
        log("WARN: no time slot options in listbox");
        await shot(page, "04b-no-slots");
      }
    } else {
      log("WARN: no time slot control");
    }

    // ── 5. Add to cart ───────────────────────────────────────────────────
    log("STEP 5: add to cart");
    const addBtn = page.locator("button#add-to-cart-button, button:has-text('Add to Cart')").first();
    await expect(addBtn).toBeVisible({ timeout: 15000 });
    await addBtn.click();
    await page.waitForTimeout(3000);
    await shot(page, "05-after-add");

    const addedOk =
      (await page.locator("button#add-to-cart-button").innerText().catch(() => "")).match(
        /Added/i
      ) ||
      (await page.locator("text=/Added to Cart/i").isVisible().catch(() => false));
    log(`add-to-cart success indicator=${!!addedOk}`);

    // ── 6. Cart page ─────────────────────────────────────────────────────
    log("STEP 6: cart");
    await page.goto(BASE_URL + "/cart", { waitUntil: "domcontentloaded" });
    await clearOverlays(page);
    await page.waitForTimeout(2000);
    await shot(page, "06-cart");

    const empty = await page.locator("text=/empty|no items/i").first().isVisible().catch(() => false);
    if (empty) {
      log("FAIL: cart appears empty after add");
      throw new Error("Cart empty after add-to-cart — frontend/backend cart not connecting");
    }

    // Prefer Store Pickup for simpler checkout (no delivery radius)
    const pickupBtn = page.locator("button:has-text('Store Pickup')").first();
    if (await pickupBtn.isVisible().catch(() => false)) {
      await pickupBtn.click();
      log("selected Store Pickup");
      await page.waitForTimeout(1000);
    }

    const checkoutBtn = page
      .locator("button#proceed-to-checkout-btn, a:has-text('Checkout'), button:has-text('Checkout')")
      .first();
    await expect(checkoutBtn).toBeVisible({ timeout: 15000 });
    await checkoutBtn.click();
    await page.waitForURL(/checkout/, { timeout: 30000 });
    await clearOverlays(page);
    await shot(page, "07-checkout");

    // ── 7. Fill checkout form ────────────────────────────────────────────
    log("STEP 7: fill checkout form");
    const email = `qa-prod-${Date.now()}@example.com`;
    const fillIfEmpty = async (sel: string, value: string) => {
      const el = page.locator(sel).first();
      if (!(await el.isVisible().catch(() => false))) {
        log(`skip missing field ${sel}`);
        return;
      }
      await el.fill(value);
    };

    await fillIfEmpty('input[name="email"]', email);
    await fillIfEmpty('input[name="phone"]', "07700900123");
    await fillIfEmpty('input[name="first-name"], input[name="first_name"]', "QA");
    await fillIfEmpty('input[name="last-name"], input[name="last_name"]', "Shopper");
    await fillIfEmpty('input[name="address"], input[name="address_1"]', "12 QA Street");
    await fillIfEmpty('input[name="city"]', "Oldbury");
    await fillIfEmpty('input[name="postal-code"], input[name="postal_code"]', "B69 1AA");

    // Select PayPal payment method
    const paypalRadio = page.locator('#payment-paypal, input[value="paypal"], label:has-text("PayPal")').first();
    if (await paypalRadio.isVisible().catch(() => false)) {
      await paypalRadio.click({ force: true });
      log("selected PayPal payment method");
    } else {
      // try card container click
      const paypalCard = page.locator("text=PayPal").first();
      if (await paypalCard.isVisible().catch(() => false)) {
        await paypalCard.click();
        log("clicked PayPal label");
      } else {
        log("WARN: PayPal option not found");
      }
    }
    await page.waitForTimeout(1500);
    await shot(page, "08-checkout-filled");

    // Click complete / continue — prod uses redirect mode ("Continue to PayPal")
    const completeBtn = page.locator("button#complete-order-btn").first();
    let paypalPage: Page = page;

    if (await completeBtn.isVisible().catch(() => false)) {
      const btnText = (await completeBtn.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      log(`complete-order-btn text=${btnText}`);
      await shot(page, "09-before-paypal");

      const popupPromise = context.waitForEvent("page", { timeout: 15000 }).catch(() => null);
      await completeBtn.click();

      // Either same-window redirect or popup
      const maybePopup = await popupPromise;
      if (maybePopup) {
        paypalPage = maybePopup;
        log(`PayPal opened in popup: ${paypalPage.url()}`);
      } else {
        await page.waitForURL(/paypal\.com|sandbox\.paypal/i, { timeout: 60000 }).catch(() => {});
        log(`after continue URL=${page.url()}`);
        if (/paypal\.com|sandbox\.paypal/i.test(page.url())) {
          paypalPage = page;
          log("PayPal opened in same window (redirect mode)");
        } else {
          // Smart Buttons iframe fallback
          const paypalIframe = page
            .locator('iframe[title*="PayPal"], iframe[name*="xcomponent"], iframe[name*="paypal"]')
            .first();
          if (await paypalIframe.isVisible({ timeout: 20000 }).catch(() => false)) {
            log("PayPal Smart Buttons iframe visible — clicking");
            const popup2 = context.waitForEvent("page", { timeout: 30000 }).catch(() => null);
            for (const f of page.frames()) {
              if (!/paypal/i.test(f.url())) continue;
              const btn = f.locator('[data-funding-source="paypal"], div[role="button"]').first();
              if (await btn.isVisible().catch(() => false)) {
                await btn.click().catch(() => {});
              }
            }
            const p2 = await popup2;
            if (p2) paypalPage = p2;
            else if (/paypal/i.test(page.url())) paypalPage = page;
          }
        }
      }
    }

    if (!/paypal\.com|sandbox\.paypal/i.test(paypalPage.url())) {
      await page.waitForTimeout(3000);
      if (!/paypal\.com|sandbox\.paypal/i.test(paypalPage.url())) {
        await shot(page, "09-paypal-FAIL");
        log(`errors: ${JSON.stringify(errors.slice(-20))}`);
        throw new Error(`Did not reach PayPal. url=${paypalPage.url()}`);
      }
    }

    log(`PayPal URL=${paypalPage.url()}`);
    await paypalPage.waitForLoadState("domcontentloaded").catch(() => {});
    await paypalPage.waitForTimeout(3000);
    await shot(paypalPage, "10-paypal-login");

    // ── 9. Sandbox login ─────────────────────────────────────────────────
    log("STEP 9: PayPal sandbox login");
    for (const t of ["Accept", "Accept All", "Accept Cookies", "Agree"]) {
      const b = paypalPage.locator(`button:has-text('${t}')`).first();
      if (await b.isVisible().catch(() => false)) {
        await b.click().catch(() => {});
      }
    }

    // Sometimes already logged in / guest card path
    const emailInput = paypalPage
      .locator('#email, input[name="login_email"], input[type="email"]')
      .first();
    const alreadyReview = await paypalPage
      .locator('#payment-submit-btn, button:has-text("Complete Purchase"), button:has-text("Pay Now")')
      .first()
      .isVisible()
      .catch(() => false);

    if (!alreadyReview && (await emailInput.isVisible().catch(() => false))) {
      await emailInput.fill(PAYPAL_EMAIL);
      const nextBtn = paypalPage
        .locator('#btnNext, button:has-text("Next"), button[name="btnNext"]')
        .first();
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        await paypalPage.waitForTimeout(2500);
      }

      const passInput = paypalPage
        .locator('#password, input[name="login_password"], input[type="password"]')
        .first();
      await expect(passInput).toBeVisible({ timeout: 45000 });
      await passInput.fill(PAYPAL_PASSWORD);
      const loginBtn = paypalPage
        .locator('#btnLogin, button:has-text("Log In"), button[name="btnLogin"]')
        .first();
      await loginBtn.click();
      log("submitted PayPal login");
      await paypalPage.waitForTimeout(5000);
    } else {
      log("PayPal already past login or different UI");
    }
    await shot(paypalPage, "11-paypal-after-login");

    // Complete purchase — sandbox review page
    const paySelectors = [
      '#payment-submit-btn',
      '#consentButton',
      'button[data-id="payment-submit-btn"]',
      'button:has-text("Complete Purchase")',
      'button:has-text("Pay Now")',
      'button:has-text("Agree & Pay")',
      'button:has-text("Continue")',
      'button[data-testid="submit-button-initial"]',
      'input[type="submit"]',
      'button[type="submit"]',
    ];
    let paid = false;
    for (let attempt = 0; attempt < 12 && !paid; attempt++) {
      // Dismiss any secondary modals
      for (const t of ["Not now", "Close", "Skip"]) {
        const b = paypalPage.locator(`button:has-text('${t}')`).first();
        if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
      }
      for (const sel of paySelectors) {
        const b = paypalPage.locator(sel).first();
        if (await b.isVisible().catch(() => false) && (await b.isEnabled().catch(() => true))) {
          const t = (await b.innerText().catch(() => sel)).replace(/\s+/g, " ").trim();
          // Avoid re-clicking Log In
          if (/log\s*in|next/i.test(t) && !/pay|complete|agree|continue/i.test(t)) continue;
          log(`PayPal action click: ${t || sel}`);
          await b.click().catch(async () => {
            await b.click({ force: true }).catch(() => {});
          });
          paid = true;
          await paypalPage.waitForTimeout(4000);
          break;
        }
      }
      if (!paid) {
        log(`waiting for pay button attempt=${attempt} url=${paypalPage.url().slice(0, 100)}`);
        await paypalPage.waitForTimeout(2500);
      }
    }
    await shot(paypalPage, "12-paypal-after-pay");

    // Wait for return to storefront (paypal-return or order confirmation)
    log("STEP 10: wait for return / order confirmation");
    try {
      await paypalPage.waitForURL(/cakebreak\.codeation\.io|localhost/, {
        timeout: 120000,
      });
      log(`returned to storefront: ${paypalPage.url()}`);
    } catch {
      log(`still on: ${paypalPage.url()} — waiting more`);
    }

    // If popup, wait for it to close and use main page
    if (paypalPage !== page) {
      await paypalPage.waitForEvent("close", { timeout: 60000 }).catch(() => {});
    }

    const successDeadline = Date.now() + 90000;
    let orderId: string | null = null;
    let confirmationText = "";

    while (Date.now() < successDeadline) {
      const pages = context.pages();
      for (const p of pages) {
        const u = p.url();
        if (!/cakebreak\.codeation\.io|localhost/.test(u)) continue;
        const body = await p.locator("body").innerText().catch(() => "");
        const m =
          body.match(/\b(order_[a-zA-Z0-9]+)\b/i) ||
          body.match(/order\s*(?:number|#|no\.?)\s*[:#]?\s*([A-Z0-9_-]{6,})/i) ||
          u.match(/order[_/=-]([A-Za-z0-9]+)/i) ||
          u.match(/[?&]order_id=([A-Za-z0-9_]+)/i);
        if (m) {
          orderId = m[1];
          confirmationText = body.slice(0, 800);
          log(`FOUND order reference: ${orderId} on ${u}`);
          await shot(p, "13-order-success");
          break;
        }
        if (/thank you|order confirmed|payment successful|order placed|order received/i.test(body)) {
          confirmationText = body.slice(0, 800);
          log(`success-looking page: ${u}`);
          log(`body snippet: ${body.slice(0, 300).replace(/\s+/g, " ")}`);
          await shot(p, "13-order-success");
          const any = body.match(/\b(order_[a-zA-Z0-9]+)\b/i);
          if (any) orderId = any[1];
          break;
        }
        // paypal-return page may still be processing
        if (/paypal-return|paypal-cancel|checkout-page/i.test(u)) {
          log(`on return/checkout page: ${u}`);
          await shot(p, "13-return-processing");
        }
      }
      if (orderId || /thank you|order confirmed|payment successful|order placed|order received/i.test(confirmationText)) {
        break;
      }
      await page.waitForTimeout(2000);
    }

    // Final state dump
    log(`final page url=${page.url()}`);
    await shot(page, "14-final");
    fs.writeFileSync(
      path.join(OUT_DIR, "result.json"),
      JSON.stringify(
        {
          orderId,
          confirmationText: confirmationText.slice(0, 1000),
          finalUrl: page.url(),
          errors: errors.slice(-50),
          email,
        },
        null,
        2
      )
    );

    log(`RESULT orderId=${orderId}`);
    log(`errors count=${errors.length}`);
    for (const e of errors.slice(-30)) log(`ERR ${e}`);

    // Soft assert: we want an order id ideally; at least no cart empty earlier
    if (!orderId && !/thank you|confirmed|success/i.test(confirmationText)) {
      throw new Error(
        `Checkout did not reach a confirmed order. finalUrl=${page.url()} errors=${errors.slice(-10).join(" | ")}`
      );
    }
  });
});
