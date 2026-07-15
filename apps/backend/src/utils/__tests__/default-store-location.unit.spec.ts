import {
  clearDefaultStoreLocation,
  setDefaultStoreLocation,
} from "../default-store-location"

describe("default-store-location helpers", () => {
  it("promotes a location and demotes siblings in the same franchise", async () => {
    const listStoreLocations = jest.fn().mockResolvedValue([
      { id: "stloc_a", franchise_id: "fran_1", is_default: true },
      { id: "stloc_b", franchise_id: "fran_1", is_default: false },
      { id: "stloc_c", franchise_id: "fran_1", is_default: false },
    ])
    const updateStoreLocations = jest.fn().mockImplementation(async (rows) => rows)

    const result = await setDefaultStoreLocation(
      { listStoreLocations, updateStoreLocations },
      "stloc_b",
      "fran_1"
    )

    expect(listStoreLocations).toHaveBeenCalledWith({ franchise_id: "fran_1" })
    expect(updateStoreLocations).toHaveBeenCalledWith([
      { id: "stloc_a", is_default: false },
      { id: "stloc_b", is_default: true },
    ])
    expect(result).toEqual({ id: "stloc_b", is_default: true })
  })

  it("does not demote already-false siblings", async () => {
    const listStoreLocations = jest.fn().mockResolvedValue([
      { id: "stloc_a", franchise_id: "fran_1", is_default: false },
      { id: "stloc_b", franchise_id: "fran_1", is_default: false },
    ])
    const updateStoreLocations = jest.fn().mockImplementation(async (rows) => rows)

    await setDefaultStoreLocation(
      { listStoreLocations, updateStoreLocations },
      "stloc_a",
      "fran_1"
    )

    expect(updateStoreLocations).toHaveBeenCalledWith([
      { id: "stloc_a", is_default: true },
    ])
  })

  it("clears the default flag on a single location", async () => {
    const updateStoreLocations = jest
      .fn()
      .mockResolvedValue([{ id: "stloc_a", is_default: false }])

    const result = await clearDefaultStoreLocation(
      {
        listStoreLocations: jest.fn(),
        updateStoreLocations,
      },
      "stloc_a"
    )

    expect(updateStoreLocations).toHaveBeenCalledWith([
      { id: "stloc_a", is_default: false },
    ])
    expect(result).toEqual({ id: "stloc_a", is_default: false })
  })
})
