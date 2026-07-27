/**
 * Unit tests for SKU / cart inventory pure helpers.
 * Run: cd apps/backend && npm run test:unit
 */

import {
  computeAvailableQuantity,
  evaluateCartInventory,
  isInventorySufficient,
  isProductAvailableFromVariants,
  isSkuInStock,
} from "../inventory-availability"

describe("computeAvailableQuantity", () => {
  it("subtracts reserved from stocked", () => {
    expect(computeAvailableQuantity(50, 5)).toBe(45)
  })

  it("floors at zero", () => {
    expect(computeAvailableQuantity(2, 5)).toBe(0)
  })
})

describe("isSkuInStock / product availability", () => {
  it("treats qty 0 as out of stock when inventory is managed", () => {
    expect(
      isSkuInStock({ manage_inventory: true, inventory_quantity: 0 })
    ).toBe(false)
  })

  it("treats default import qty 50 as in stock", () => {
    expect(
      isSkuInStock({ manage_inventory: true, inventory_quantity: 50 })
    ).toBe(true)
  })

  it("product OOS only when every variant is OOS", () => {
    expect(
      isProductAvailableFromVariants([
        { manage_inventory: true, inventory_quantity: 0 },
      ])
    ).toBe(false)
  })
})

describe("evaluateCartInventory", () => {
  it("blocks cart when requested exceeds available", () => {
    const r = evaluateCartInventory([
      {
        variant_id: "v1",
        requested_quantity: 3,
        available_quantity: 2,
      },
    ])
    expect(r.all_sufficient).toBe(false)
    expect(isInventorySufficient(2, 3)).toBe(false)
  })

  it("allows exact match", () => {
    const r = evaluateCartInventory([
      {
        variant_id: "v1",
        requested_quantity: 2,
        available_quantity: 2,
      },
    ])
    expect(r.all_sufficient).toBe(true)
  })
})
