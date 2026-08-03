import {
  isOfflineOrderCategoryHandle,
  productHasOfflineOrderCategory,
  OFFLINE_ORDER_CATEGORY_HANDLES,
} from "../offline-order-categories"

describe("offline-order-categories", () => {
  it("includes icing and wedding handles", () => {
    expect(OFFLINE_ORDER_CATEGORY_HANDLES).toContain("icing-cakes")
    expect(OFFLINE_ORDER_CATEGORY_HANDLES).toContain("wedding-cakes")
  })

  it("matches handles case-insensitively", () => {
    expect(isOfflineOrderCategoryHandle("wedding-cakes")).toBe(true)
    expect(isOfflineOrderCategoryHandle("Wedding-Cakes")).toBe(true)
    expect(isOfflineOrderCategoryHandle("birthday-round-cakes")).toBe(false)
    expect(isOfflineOrderCategoryHandle(null)).toBe(false)
  })

  it("treats wedding/icing as offline, with heart-cake exception for wedding", () => {
    expect(
      productHasOfflineOrderCategory([
        { handle: "birthday-round-cakes" },
        { handle: "wedding-cakes" },
      ])
    ).toBe(true)
    expect(
      productHasOfflineOrderCategory([{ handle: "icing-cakes" }])
    ).toBe(true)
    expect(
      productHasOfflineOrderCategory([{ handle: "birthday-round-cakes" }])
    ).toBe(false)
    expect(productHasOfflineOrderCategory([])).toBe(false)
    expect(productHasOfflineOrderCategory(null)).toBe(false)
    // (H1) Heart Wedding Cake — heart shape, site-orderable
    expect(
      productHasOfflineOrderCategory([
        { handle: "heart-cake" },
        { handle: "wedding-cakes" },
        { handle: "valentines" },
      ])
    ).toBe(false)
    // Icing still offline even if also heart-shaped
    expect(
      productHasOfflineOrderCategory([
        { handle: "heart-cake" },
        { handle: "icing-cakes" },
      ])
    ).toBe(true)
  })
})
