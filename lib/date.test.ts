import { thisMondayUtc } from "./date"

describe("thisMondayUtc", () => {
  test.each([
    ["2023-02-25T12:34:56-08:00", "2023-02-20T00:00:00.000Z"],
    ["2023-02-26T00:00:00-08:00", "2023-02-20T00:00:00.000Z"],
    ["2023-02-26T15:59:59-08:00", "2023-02-20T00:00:00.000Z"],
    ["2023-02-26T16:00:00-08:00", "2023-02-27T00:00:00.000Z"],
    ["2023-02-26T18:00:00-08:00", "2023-02-27T00:00:00.000Z"],
    ["2023-02-27T00:00:00-08:00", "2023-02-27T00:00:00.000Z"],
    ["2023-02-27T12:34:56-08:00", "2023-02-27T00:00:00.000Z"],
    ["2023-02-27T00:00:00.000Z", "2023-02-27T00:00:00.000Z"],
  ])("times: %s -> %s", (input: string, expected: string) => {
    expect(thisMondayUtc(new Date(input)).toISOString()).toBe(expected)
  })
})