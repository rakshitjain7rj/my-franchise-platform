import {
  buildUnfulfilledItemsPayload,
  remainingFulfillQuantity,
} from "../cake-order-fulfill"

describe("remainingFulfillQuantity", () => {
  it("uses detail.quantity when present", () => {
    expect(
      remainingFulfillQuantity({
        id: "i1",
        quantity: 5,
        detail: { quantity: 3, fulfilled_quantity: 1 },
      })
    ).toBe(2)
  })

  it("falls back to item.quantity when detail is missing", () => {
    expect(remainingFulfillQuantity({ id: "i1", quantity: 2 })).toBe(2)
  })

  it("returns 0 when fully fulfilled", () => {
    expect(
      remainingFulfillQuantity({
        id: "i1",
        quantity: 2,
        detail: { quantity: 2, fulfilled_quantity: 2 },
      })
    ).toBe(0)
  })

  it("never returns negative", () => {
    expect(
      remainingFulfillQuantity({
        id: "i1",
        detail: { quantity: 1, fulfilled_quantity: 5 },
      })
    ).toBe(0)
  })
})

describe("buildUnfulfilledItemsPayload", () => {
  it("includes only lines with remaining quantity", () => {
    expect(
      buildUnfulfilledItemsPayload([
        { id: "a", quantity: 2, detail: { quantity: 2, fulfilled_quantity: 0 } },
        { id: "b", quantity: 1, detail: { quantity: 1, fulfilled_quantity: 1 } },
        { id: "c", quantity: 3, detail: { quantity: 3, fulfilled_quantity: 1 } },
      ])
    ).toEqual([
      { id: "a", quantity: 2 },
      { id: "c", quantity: 2 },
    ])
  })

  it("returns empty array when nothing left", () => {
    expect(
      buildUnfulfilledItemsPayload([
        { id: "a", detail: { quantity: 1, fulfilled_quantity: 1 } },
      ])
    ).toEqual([])
  })

  it("handles null/undefined items", () => {
    expect(buildUnfulfilledItemsPayload(null)).toEqual([])
    expect(buildUnfulfilledItemsPayload(undefined)).toEqual([])
  })
})
