import { test, expect } from "@playwright/test";

test.setTimeout(90000);

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

// Helper function to register a new user and optionally update phone
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
    // Go to profile tab and save phone
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

test.describe("A. Account Profile & Address Book Tests", () => {
  
  test("A1 — Address form pre-fills account name and phone", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    
    // Go to account addresses
    await page.goto(`${BASE_URL}/account?tab=addresses`);
    await clearOverlays(page);
    
    // Click Add Address
    const addAddrBtn = page.locator("button:has-text('Add Address')");
    await expect(addAddrBtn).toBeVisible();
    await addAddrBtn.click();
    
    // Check pre-filled values
    const firstNameVal = await page.locator('input[name="first_name"]').inputValue();
    const lastNameVal = await page.locator('input[name="last_name"]').inputValue();
    const phoneVal = await page.locator('input[name="phone"]').inputValue();
    
    expect(firstNameVal).toBe("Alex");
    expect(lastNameVal).toBe("Baker");
    expect(phoneVal).toBe("07111 111111");
    
    // Check empty fields
    expect(await page.locator('input[name="address_1"]').inputValue()).toBe("");
    expect(await page.locator('input[name="city"]').inputValue()).toBe("");
    expect(await page.locator('input[name="postal_code"]').inputValue()).toBe("");
    
    // Check helper text
    const helperText = page.locator("text=Name is pre-filled from your account.");
    await expect(helperText).toBeVisible();
  });

  test("A2 & A3 — Change recipient name to Mum / Baker, save as first address (becomes default)", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    
    await page.goto(`${BASE_URL}/account?tab=addresses`);
    await clearOverlays(page);
    
    await page.locator("button:has-text('Add Address')").click();
    
    // Change first/last name to Mum / Baker
    await page.fill('input[name="first_name"]', "Mum");
    await page.fill('input[name="last_name"]', "Baker");
    await page.fill('input[name="address_name"]', "Mum's house");
    await page.fill('input[name="address_1"]', "10 Mum Road");
    await page.fill('input[name="city"]', "London");
    await page.fill('input[name="postal_code"]', "SW1A 1AA");
    await page.fill('input[name="phone"]', "07222 222222");
    
    // Submit
    await page.click("button:has-text('Save Address')");
    
    // Verify address card
    const cardTitle = page.locator("p.font-bold:has-text(\"Mum's house\")");
    await expect(cardTitle).toBeVisible({ timeout: 10000 });
    
    const deliverToText = page.locator("text=Deliver to: Mum Baker");
    await expect(deliverToText).toBeVisible();
    
    // Verify A3: First address becomes default shipping/billing automatically
    await expect(page.locator("text=Default Shipping")).toBeVisible();
    await expect(page.locator("text=Default Billing")).toBeVisible();
    
    // Verify account profile name remains Alex Baker
    await page.goto(`${BASE_URL}/account?tab=profile`);
    await clearOverlays(page);
    expect(await page.locator('input[name="first_name"]').inputValue()).toBe("Alex");
    expect(await page.locator('input[name="last_name"]').inputValue()).toBe("Baker");
  });

  test("A4 & A5 — Second address is not forced default, explicit default on third", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    
    await page.goto(`${BASE_URL}/account?tab=addresses`);
    await clearOverlays(page);
    
    // 1. Add Address A (Mum's House) - First Address
    await page.locator("button:has-text('Add Address')").click();
    await page.fill('input[name="first_name"]', "Mum");
    await page.fill('input[name="last_name"]', "Baker");
    await page.fill('input[name="address_name"]', "Mum's house");
    await page.fill('input[name="address_1"]', "10 Mum Road");
    await page.fill('input[name="city"]', "London");
    await page.fill('input[name="postal_code"]', "SW1A 1AA");
    await page.click("button:has-text('Save Address')");
    await expect(page.locator("p.font-bold:has-text(\"Mum's house\")")).toBeVisible({ timeout: 10000 });
    
    // 2. Add Address B (Office) - Second Address without ticking default
    await page.locator("button:has-text('Add Address')").click();
    await page.fill('input[name="first_name"]', "Alex");
    await page.fill('input[name="last_name"]', "Baker");
    await page.fill('input[name="address_name"]', "My Office");
    await page.fill('input[name="address_1"]', "100 Work Ave");
    await page.fill('input[name="city"]', "Birmingham");
    await page.fill('input[name="postal_code"]', "B21 0AL");
    
    // Make sure checkboxes are unticked
    const shippingCheckbox = page.locator('input[name="is_default_shipping"]');
    const billingCheckbox = page.locator('input[name="is_default_billing"]');
    if (await shippingCheckbox.isChecked()) {
      await shippingCheckbox.uncheck();
    }
    if (await billingCheckbox.isChecked()) {
      await billingCheckbox.uncheck();
    }
    
    await page.click("button:has-text('Save Address')");
    await expect(page.locator("p.font-bold:has-text(\"My Office\")")).toBeVisible({ timeout: 10000 });
    
    // Verify A4: First remains default, second is NOT default
    const mumCard = page.locator("div.border.rounded-2xl:has(p:has-text(\"Mum's house\"))");
    const officeCard = page.locator("div.border.rounded-2xl:has(p:has-text(\"My Office\"))");
    
    await expect(mumCard.locator("text=Default Shipping")).toBeVisible();
    await expect(officeCard.locator("text=Default Shipping")).not.toBeVisible();
    
    // 3. Add Address C (Home) - Explicitly set as default shipping
    await page.locator("button:has-text('Add Address')").click();
    await page.fill('input[name="first_name"]', "Alex");
    await page.fill('input[name="last_name"]', "Baker");
    await page.fill('input[name="address_name"]', "My Home");
    await page.fill('input[name="address_1"]', "50 Cozy Lane");
    await page.fill('input[name="city"]', "Birmingham");
    await page.fill('input[name="postal_code"]', "B21 0AL");
    
    // Set as default shipping explicitly
    if (!(await shippingCheckbox.isChecked())) {
      await shippingCheckbox.check();
    }
    
    await page.click("button:has-text('Save Address')");
    await expect(page.locator("p.font-bold:has-text(\"My Home\")")).toBeVisible({ timeout: 10000 });
    
    // Verify A5: Home becomes default shipping, Mum's house is no longer default shipping
    const homeCard = page.locator("div.border.rounded-2xl:has(p:has-text(\"My Home\"))");
    await expect(homeCard.locator("text=Default Shipping")).toBeVisible();
    await expect(mumCard.locator("text=Default Shipping")).not.toBeVisible();
  });

  test("A6 — Allow saving address when names are cleared and filled manually on form", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    
    await page.goto(`${BASE_URL}/account?tab=addresses`);
    await clearOverlays(page);
    
    await page.locator("button:has-text('Add Address')").click();
    
    // Clear the prefilled first/last names
    await page.fill('input[name="first_name"]', "");
    await page.fill('input[name="last_name"]', "");
    
    // Fill manually
    await page.fill('input[name="first_name"]', "CustomFirstName");
    await page.fill('input[name="last_name"]', "CustomLastName");
    await page.fill('input[name="address_name"]', "Manual Name House");
    await page.fill('input[name="address_1"]', "77 Manual Street");
    await page.fill('input[name="city"]', "London");
    await page.fill('input[name="postal_code"]', "SW1A 1AA");
    
    await page.click("button:has-text('Save Address')");
    await expect(page.locator("p.font-bold:has-text(\"Manual Name House\")")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Deliver to: CustomFirstName CustomLastName")).toBeVisible();
  });

  test("A7 — Delete address book entries", async ({ page }) => {
    await registerUser(page, "Alex", "Baker", "07111 111111");
    
    await page.goto(`${BASE_URL}/account?tab=addresses`);
    await clearOverlays(page);
    
    // 1. Add Address (Office)
    await page.locator("button:has-text('Add Address')").click();
    await page.fill('input[name="first_name"]', "Alex");
    await page.fill('input[name="last_name"]', "Baker");
    await page.fill('input[name="address_name"]', "Office To Delete");
    await page.fill('input[name="address_1"]', "10 Delete Ave");
    await page.fill('input[name="city"]', "London");
    await page.fill('input[name="postal_code"]', "SW1A 1AA");
    await page.click("button:has-text('Save Address')");
    
    const card = page.locator("div.border.rounded-2xl:has(p:has-text(\"Office To Delete\"))");
    await expect(card).toBeVisible({ timeout: 10000 });
    
    // 2. Click Delete Trash Icon
    const trashBtn = card.locator("button[title='Delete address']");
    await expect(trashBtn).toBeVisible();
    await trashBtn.click();
    
    // 3. Confirm Delete (click the check mark button next to "Delete?")
    const checkBtn = card.locator("span:has-text('Delete?') + button");
    await expect(checkBtn).toBeVisible();
    await checkBtn.click();
    
    // 4. Verify card is gone
    await expect(card).not.toBeVisible({ timeout: 10000 });
  });

});
