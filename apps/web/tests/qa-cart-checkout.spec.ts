import { test, expect } from "@playwright/test";

test.setTimeout(120000);

const BASE_URL = "http://localhost:3000";

// Helper to clear overlays like cookies and install prompts
async function clearOverlays(page) {
  const dismissInstall = page.locator("button:has-text('Not now'), button:has-text('Dismiss install prompt')").first();
  if (await dismissInstall.isVisible()) {
    await dismissInstall.click({ force: true }).catch(() => {});
  }
  const acceptCookies = page.locator("button:has-text('Accept all'), button:has-text('Essential only')").first();
  if (await acceptCookies.isVisible()) {
    await acceptCookies.click({ force: true }).catch(() => {});
  }
}

// Generate a random email
function getRandomEmail() {
  return `alex-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
}

// Helper to register user
async function registerUser(page, firstName = "Alex", lastName = "Baker", phone = "07111 111111") {
  const email = getRandomEmail();
  const password = "Password123!";
  
  await page.goto(`${BASE_URL}/signup`);
  await clearOverlays(page);
  
  await page.fill('input[name="first_name"]', firstName);
  await page.fill('input[name="last_name"]', lastName);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirm_password"]', password);
  await page.click('button[type="submit"]');
  
  if (page.url().includes("/signup")) {
    await page.waitForURL(url => !url.href.includes("/signup"), { timeout: 45000 });
  }
  await clearOverlays(page);
  
  if (phone) {
    await page.goto(`${BASE_URL}/account?tab=profile`);
    await clearOverlays(page);
    const phoneInput = page.locator('input[name="phone"]');
    await expect(phoneInput).toBeVisible();
    await phoneInput.fill(phone);
    await page.click("button:has-text('Save Changes')");
    await expect(page.locator("text=Profile updated successfully!")).toBeVisible({ timeout: 15000 });
  }
  
  return { email, password };
}

// Helper to select location, pick product, pick slot, and add to cart
async function addCakeToCart(page) {
  await page.goto(`${BASE_URL}/map-routing`);
  await clearOverlays(page);
  
  const birminghamBtn = page.locator("button[aria-label='Select Cakery Birmingham - Soho Road']");
  if (await birminghamBtn.isVisible()) {
    await birminghamBtn.click();
  } else {
    const firstBtn = page.locator("button[id^='select-location-']").first();
    await expect(firstBtn).toBeVisible();
    await firstBtn.click();
  }
  
  if (page.url() !== `${BASE_URL}/`) {
    await page.waitForURL(`${BASE_URL}/`, { timeout: 45000 });
  }
  await clearOverlays(page);
  
  const productCard = page.locator("a[href^='/products/']").first();
  await expect(productCard).toBeVisible();
  await productCard.click();
  
  await page.waitForURL(/.*\/products\/.*/, { timeout: 45000 });
  await clearOverlays(page);
  
  const dateInput = page.locator("input[type='date']");
  await expect(dateInput).toBeVisible();
  const minDate = await dateInput.getAttribute("min");
  const val = await dateInput.inputValue();
  if (!val && minDate) {
    await dateInput.fill(minDate);
  }
  
  const timeSelect = page.locator("select");
  await expect(timeSelect).toBeVisible();
  await timeSelect.selectOption({ index: 1 });
  
  const addToCartBtn = page.locator("button#add-to-cart-button");
  await expect(addToCartBtn).toBeVisible();
  await addToCartBtn.click();
  
  await expect(page.locator("button#add-to-cart-button")).toHaveText("Added to Cart!", { timeout: 15000 });
}

// Add a default address book entry
async function addAddressToBook(page, label, first, last, street, city, postcode, phone, isDefault = true) {
  await page.goto(`${BASE_URL}/account?tab=addresses`);
  await clearOverlays(page);
  
  await page.locator("button:has-text('Add Address')").click();
  await page.fill('input[name="address_name"]', label);
  await page.fill('input[name="first_name"]', first);
  await page.fill('input[name="last_name"]', last);
  await page.fill('input[name="address_1"]', street);
  await page.fill('input[name="city"]', city);
  await page.fill('input[name="postal_code"]', postcode);
  await page.fill('input[name="phone"]', phone);
  
  const shippingCheckbox = page.locator('input[name="is_default_shipping"]');
  const billingCheckbox = page.locator('input[name="is_default_billing"]');
  if (isDefault) {
    if (!(await shippingCheckbox.isChecked())) await shippingCheckbox.check();
    if (!(await billingCheckbox.isChecked())) await billingCheckbox.check();
  } else {
    if (await shippingCheckbox.isChecked()) await shippingCheckbox.uncheck();
    if (await billingCheckbox.isChecked()) await billingCheckbox.uncheck();
  }
  
  await page.click("button:has-text('Save Address')");
  await expect(page.locator(`p.font-bold:has-text("${label}")`)).toBeVisible({ timeout: 15000 });
}

test.describe("B. Cart & Delivery Postcode Linkage Tests", () => {

  test("B1 & B2 — Prefilled from default address & not overwritten by subsequent refresh", async ({ page }) => {
    // 1. Setup user with default address (postcode: B21 0AL)
    await registerUser(page, "Alex", "Baker", "07111 111111");
    await addAddressToBook(page, "Home", "Alex", "Baker", "Soho Rd", "Birmingham", "B21 0AL", "07111 111111", true);
    
    // 2. Add cake to cart
    await addCakeToCart(page);
    
    // 3. Go to cart and toggle delivery
    await page.goto(`${BASE_URL}/cart`);
    await clearOverlays(page);
    
    const deliveryBtn = page.locator("button:has-text('Local Delivery')");
    await expect(deliveryBtn).toBeVisible();
    await deliveryBtn.click();
    
    // 4. Verify postcode field has default address postcode: B21 0AL
    const postcodeInput = page.locator("input[placeholder='e.g. SW1A 1AA']");
    await expect(postcodeInput).toBeVisible();
    expect(await postcodeInput.inputValue()).toBe("B21 0AL");
    
    // 5. Verify B2: Set cart postcode to W1D 1AN and get fee
    await postcodeInput.fill("W1D 1AN");
    const getFeeBtn = page.locator("button:has-text('Get fee')");
    await getFeeBtn.click();
    await page.waitForTimeout(2000);
    
    // Refresh page
    await page.reload();
    await clearOverlays(page);
    
    // Toggle Local Delivery again (fulfillment type is persisted, but toggle shows options)
    await expect(postcodeInput).toBeVisible();
    
    // Expect it to still be W1D 1AN (not overwritten by B21 0AL from address book)
    expect(await postcodeInput.inputValue()).toBe("W1D 1AN");
  });

  test("B3 — Guest / Not logged in (postcode empty, no error)", async ({ page, context }) => {
    await context.clearCookies();
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/cart`);
    await clearOverlays(page);
    
    const deliveryBtn = page.locator("button:has-text('Local Delivery')");
    await expect(deliveryBtn).toBeVisible();
    await deliveryBtn.click();
    
    const postcodeInput = page.locator("input[placeholder='e.g. SW1A 1AA']");
    await expect(postcodeInput).toBeVisible();
    expect(await postcodeInput.inputValue()).toBe("");
  });

  test("B4 — Pickup mode (no postcode required, checkout still works)", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    await addAddressToBook(page, "Home", "Alex", "Baker", "Soho Rd", "Birmingham", "B21 0AL", "07111 111111", true);
    
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/cart`);
    await clearOverlays(page);
    
    // Make sure Store Pickup is selected
    const pickupBtn = page.locator("button:has-text('Store Pickup')");
    await expect(pickupBtn).toBeVisible();
    await pickupBtn.click();
    
    // Go to checkout
    const checkoutBtn = page.locator("button#proceed-to-checkout-btn");
    await expect(checkoutBtn).toBeVisible();
    await checkoutBtn.click();
    
    // Verify checkout loads
    await page.waitForURL(`${BASE_URL}/checkout-page`, { timeout: 15000 });
    await expect(page.locator("text=Secure Checkout")).toBeVisible();
  });

});

test.describe("C. Checkout — Contact & Shipping Prefill Tests", () => {

  test("C1, C2 & C9 — Full prefill, Mum name from default, email remains yours", async ({ page }) => {
    // 1. Setup profile Alex Baker, default address Mum Baker
    const credentials = await registerUser(page, "Alex", "Baker", "07111 111111");
    await addAddressToBook(page, "Mum's house", "Mum", "Baker", "10 Mum St", "London", "SW1A 1AA", "07222 222222", true);
    
    await addCakeToCart(page);
    
    // 2. Go to checkout page
    await page.goto(`${BASE_URL}/checkout-page`);
    await clearOverlays(page);
    
    // 3. Verify prefilled details
    const emailVal = await page.locator('input[name="email"]').inputValue();
    const phoneVal = await page.locator('input[name="phone"]').inputValue();
    const firstNameVal = await page.locator('input[name="first-name"]').inputValue();
    const lastNameVal = await page.locator('input[name="last-name"]').inputValue();
    const addressVal = await page.locator('input[name="address"]').inputValue();
    const cityVal = await page.locator('input[name="city"]').inputValue();
    const postcodeVal = await page.locator('input[name="postal-code"]').inputValue();
    
    expect(emailVal).toBe(credentials.email);
    expect(phoneVal).toBe("07222 222222"); // C9/Prefill default phone
    expect(firstNameVal).toBe("Mum"); // C2: Recipient is Mum Baker
    expect(lastNameVal).toBe("Baker");
    expect(addressVal).toBe("10 Mum St");
    expect(cityVal).toBe("London");
    expect(postcodeVal).toBe("SW1A 1AA");
  });

  test("C3 — Profile-only (no address book) pre-fills account details, empty address fields, no dropdown", async ({ page }) => {
    const credentials = await registerUser(page, "Alex", "Baker", "07111 111111");
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/checkout-page`);
    await clearOverlays(page);
    
    // Prefills contact only
    expect(await page.locator('input[name="email"]').inputValue()).toBe(credentials.email);
    expect(await page.locator('input[name="phone"]').inputValue()).toBe("07111 111111");
    expect(await page.locator('input[name="first-name"]').inputValue()).toBe("Alex");
    expect(await page.locator('input[name="last-name"]').inputValue()).toBe("Baker");
    
    // Address empty
    expect(await page.locator('input[name="address"]').inputValue()).toBe("");
    expect(await page.locator('input[name="city"]').inputValue()).toBe("");
    expect(await page.locator('input[name="postal-code"]').inputValue()).toBe("");
    
    // Dropdown should not exist
    const picker = page.locator("select#saved-address");
    await expect(picker).not.toBeVisible();
  });

  test("C4 — Guest checkout has empty form and no crash", async ({ page, context }) => {
    await context.clearCookies();
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/checkout-page`);
    await clearOverlays(page);
    
    expect(await page.locator('input[name="email"]').inputValue()).toBe("");
    expect(await page.locator('input[name="first-name"]').inputValue()).toBe("");
    expect(await page.locator('input[name="last-name"]').inputValue()).toBe("");
    expect(await page.locator('input[name="address"]').inputValue()).toBe("");
    
    await expect(page.locator("button#complete-order-btn")).toBeVisible();
  });

  test("C5, C6 & C7 — Saved address picker switching, Enter different address, and Editing switches to custom", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    await addAddressToBook(page, "My Self", "Alex", "Baker", "1 Self St", "Birmingham", "B21 0AL", "07111 111111", true);
    await addAddressToBook(page, "Mum's house", "Mum", "Baker", "10 Mum St", "London", "SW1A 1AA", "07222 222222", false);
    
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/checkout-page`);
    await clearOverlays(page);
    
    // Picker is visible
    const picker = page.locator("select#saved-address");
    await expect(picker).toBeVisible();
    
    // C5: Default is A (My Self)
    expect(await page.locator('input[name="first-name"]').inputValue()).toBe("Alex");
    expect(await page.locator('input[name="address"]').inputValue()).toBe("1 Self St");
    
    // Switch to B (Mum's house)
    const optionsText = await picker.evaluate(el => Array.from((el as HTMLSelectElement).options).map(o => o.text));
    const mumOptionValue = await picker.evaluate(el => {
      const opt = Array.from((el as HTMLSelectElement).options).find(o => o.text.includes("Mum's house"));
      return opt ? opt.value : "";
    });
    
    await picker.selectOption(mumOptionValue);
    
    // Verify recipient updates to Mum Baker
    expect(await page.locator('input[name="first-name"]').inputValue()).toBe("Mum");
    expect(await page.locator('input[name="address"]').inputValue()).toBe("10 Mum St");
    expect(await page.locator('input[name="postal-code"]').inputValue()).toBe("SW1A 1AA");
    
    // C7: Edit field switches selector to custom
    await page.fill('input[name="address"]', "10 Mum St Edited");
    expect(await picker.inputValue()).toBe("custom");
    
    // C6: Choose custom address directly
    await picker.selectOption("custom");
    await page.fill('input[name="address"]', "Different St");
    expect(await page.locator('input[name="address"]').inputValue()).toBe("Different St");
  });

  test("C8 — Mid-checkout resume details preserved", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/checkout-page`);
    await clearOverlays(page);
    
    // Fill in custom address
    await page.fill('input[name="address"]', "99 Mid Street");
    await page.fill('input[name="city"]', "Birmingham");
    await page.fill('input[name="postal-code"]', "B21 0AL");
    
    // Navigate away to cart
    await page.goto(`${BASE_URL}/cart`);
    await clearOverlays(page);
    
    // Reopen checkout
    await page.goto(`${BASE_URL}/checkout-page`);
    await clearOverlays(page);
    
    // Details should be preserved
    expect(await page.locator('input[name="address"]').inputValue()).toBe("99 Mid Street");
    expect(await page.locator('input[name="postal-code"]').inputValue()).toBe("B21 0AL");
  });

});

test.describe("D. End-to-End Order Placement Tests", () => {

  test("D1 — Place order with prefilled self address", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    await addAddressToBook(page, "My Self", "Alex", "Baker", "1 Self St", "Birmingham", "B21 0AL", "07111 111111", true);
    
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/checkout-page`);
    await clearOverlays(page);
    
    // Select Card Payment (default) and submit
    await page.click("button#complete-order-btn");
    
    // Verify order succeeds
    await expect(page.locator("text=Order Confirmed!")).toBeVisible({ timeout: 25000 });
    await expect(page.locator("text=Thank you, Alex")).toBeVisible();
    await expect(page.locator("text=1 Self St, Birmingham, B21 0AL")).toBeVisible();
  });

  test("D2 — Place order to Mum address via picker", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    await addAddressToBook(page, "My Self", "Alex", "Baker", "1 Self St", "Birmingham", "B21 0AL", "07111 111111", true);
    await addAddressToBook(page, "Mum's house", "Mum", "Baker", "10 Mum St", "London", "SW1A 1AA", "07222 222222", false);
    
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/checkout-page`);
    await clearOverlays(page);
    
    const picker = page.locator("select#saved-address");
    const mumOptionValue = await picker.evaluate(el => {
      const opt = Array.from((el as HTMLSelectElement).options).find(o => o.text.includes("Mum's house"));
      return opt ? opt.value : "";
    });
    await picker.selectOption(mumOptionValue);
    
    await page.click("button#complete-order-btn");
    
    await expect(page.locator("text=Order Confirmed!")).toBeVisible({ timeout: 25000 });
    await expect(page.locator("text=Thank you, Mum")).toBeVisible();
    await expect(page.locator("text=10 Mum St, London, SW1A 1AA")).toBeVisible();
  });

  test("D3 — Delivery fee path uses checkout postcode", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    await addAddressToBook(page, "My Self", "Alex", "Baker", "Soho Rd", "Birmingham", "B21 0AL", "07111 111111", true);
    
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/cart`);
    await clearOverlays(page);
    
    // Choose delivery
    const deliveryBtn = page.locator("button:has-text('Local Delivery')");
    await deliveryBtn.click();
    
    const postcodeInput = page.locator("input[placeholder='e.g. SW1A 1AA']");
    expect(await postcodeInput.inputValue()).toBe("B21 0AL");
    
    await page.click("button:has-text('Get fee')");
    await page.waitForTimeout(2000);
    
    const cartTotalText = await page.locator("dt:has-text('Total') + dd").innerText();
    
    // Click checkout
    await page.locator("button#proceed-to-checkout-btn").click();
    await page.waitForURL(`${BASE_URL}/checkout-page`, { timeout: 15000 });
    
    const checkoutTotalText = await page.locator("dt:has-text('Total') + dd").innerText();
    expect(checkoutTotalText).toBe(cartTotalText);
  });

  test("D4 — Outside radius delivery postcode is rejected on checkout fee check", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/cart`);
    await clearOverlays(page);
    
    const deliveryBtn = page.locator("button:has-text('Local Delivery')");
    await deliveryBtn.click();
    
    const postcodeInput = page.locator("input[placeholder='e.g. SW1A 1AA']");
    await postcodeInput.fill("SW1A 1AA"); // London postcode (outside Birmingham bakery radius)
    
    await page.click("button:has-text('Get fee')");
    await page.waitForTimeout(2000);
    
    // Error is shown
    await expect(page.locator("text=outside the 10 km delivery radius")).toBeVisible();
  });

});

test.describe("E. Regression & Edge Cases Tests", () => {

  test("E1 — Guest cart items retained after logging in", async ({ page, context }) => {
    await context.clearCookies();
    
    // 1. Guest adds product to cart
    await addCakeToCart(page);
    
    // 2. Register user
    const credentials = await registerUser(page, "Alex", "Baker", "07111 111111");
    
    // 3. Check if product is still in cart
    await page.goto(`${BASE_URL}/cart`);
    await clearOverlays(page);
    
    await expect(page.locator("text=Your Confectionery Cart")).toBeVisible();
    const cartItemsCount = await page.locator("a[href^='/products/']").count();
    expect(cartItemsCount).toBeGreaterThan(0);
  });

  test("E2 — Session isolation prevents User B from seeing User A's data", async ({ page, context }) => {
    // User A logs in and saves address
    await registerUser(page, "UserA", "Baker", "07111 111111");
    await addAddressToBook(page, "UserA House", "UserA", "Baker", "1 UserA Rd", "London", "SW1A 1AA", "07111 111111", true);
    
    // Log out User A
    await page.goto(`${BASE_URL}/`);
    await clearOverlays(page);
    const userAccountBtn = page.locator("button[aria-label='User Account']");
    await userAccountBtn.hover();
    await page.click("button:has-text('Sign Out')");
    await page.waitForTimeout(1000);
    
    // Sign up User B
    await registerUser(page, "UserB", "Baker", "07222 222222");
    
    // Go to Address Book
    await page.goto(`${BASE_URL}/account?tab=addresses`);
    await clearOverlays(page);
    
    // Make sure User B does NOT see User A's address
    await expect(page.locator("text=UserA House")).not.toBeVisible();
  });

  test("E3 — Required field validation blocks bad checkout submission", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/checkout-page`);
    await clearOverlays(page);
    
    // Clear required fields
    await page.fill('input[name="first-name"]', "");
    await page.fill('input[name="address"]', "");
    
    await page.click("button#complete-order-btn");
    
    // Form remains on checkout-page
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(`${BASE_URL}/checkout-page`);
  });

  test("E5 & E6 — Long names, missing spaces, and hard refresh pre-fills work", async ({ page }) => {
    await registerUser(page, "Alex-Sasha-Fierce-Longname", "Baker-Hyphenated", "07111 111111");
    await addAddressToBook(page, "Special House", "Alex-Sasha-Fierce-Longname", "Baker-Hyphenated", "Long Street Name 123", "Birmingham", "B210AL", "07111 111111", true);
    
    await addCakeToCart(page);
    
    await page.goto(`${BASE_URL}/checkout-page`);
    await clearOverlays(page);
    
    // Prefill holds the details
    expect(await page.locator('input[name="first-name"]').inputValue()).toBe("Alex-Sasha-Fierce-Longname");
    expect(await page.locator('input[name="postal-code"]').inputValue()).toBe("B210AL");
    
    // Hard refresh
    await page.reload();
    await clearOverlays(page);
    
    // Still prefilled
    expect(await page.locator('input[name="first-name"]').inputValue()).toBe("Alex-Sasha-Fierce-Longname");
    expect(await page.locator('input[name="postal-code"]').inputValue()).toBe("B210AL");
  });

});
