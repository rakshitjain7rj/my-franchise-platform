/**
 * Unit tests for inventory item title backfill helper.
 * Run: cd apps/backend && npm run test:unit -- --testPathPattern=inventory-item-titles
 */

import {
  buildInventoryItemTitle,
  inventoryTitleNeedsUpdate,
} from "../../scripts/one-off/backfill-inventory-item-titles"

describe("buildInventoryItemTitle", () => {
  it("prefixes product name onto generic variant title", () => {
    expect(
      buildInventoryItemTitle(
        "(X2) Christmas Themed Cake",
        '8" (approx 10 servings) / Chocolate Sponge'
      )
    ).toBe(
      '(X2) Christmas Themed Cake — 8" (approx 10 servings) / Chocolate Sponge'
    )
  })

  it("is idempotent when already product-prefixed", () => {
    const once = buildInventoryItemTitle(
      "(X1) Santa Cake",
      '10" / Victoria Sponge'
    )
    expect(buildInventoryItemTitle("(X1) Santa Cake", once)).toBe(once)
  })

  it("handles empty variant title", () => {
    expect(buildInventoryItemTitle("Chocolate Truffle", "")).toBe(
      "Chocolate Truffle"
    )
  })

  it("handles empty product title", () => {
    expect(buildInventoryItemTitle("", '8" / Red Velvet')).toBe(
      '8" / Red Velvet'
    )
  })

  it("does not double-prefix hyphen form", () => {
    const existing =
      '(X2) Christmas Themed Cake - 8" (approx 10 servings) / Chocolate Sponge'
    expect(
      buildInventoryItemTitle("(X2) Christmas Themed Cake", existing)
    ).toBe(existing)
  })
})

describe("inventoryTitleNeedsUpdate", () => {
  it("detects generic titles", () => {
    expect(
      inventoryTitleNeedsUpdate(
        '8" / Chocolate Sponge',
        '(X2) Cake — 8" / Chocolate Sponge'
      )
    ).toBe(true)
  })

  it("skips already-updated titles", () => {
    const t = '(X2) Cake — 8" / Chocolate Sponge'
    expect(inventoryTitleNeedsUpdate(t, t)).toBe(false)
  })
})
