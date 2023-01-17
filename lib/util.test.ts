import { Interval } from './parse'
import { combineIntervals } from './util'

describe("combineIntervals", () => {
  test("handles empty input", () => {
    expect(combineIntervals([])).toEqual([])
    expect(combineIntervals([[]])).toEqual([])
    expect(combineIntervals([[], []])).toEqual([])
  })

  test("handles disjoint input", () => {
    expect(combineIntervals([[[1, 2]], [[3, 4], [5, 6]]] as Interval[][])).toEqual([
      { count: 1, interval: [1, 2] },
      { count: 1, interval: [3, 4] },
      { count: 1, interval: [5, 6] },
    ])
  })

  test("handles two-overlapping input", () => {
    expect(combineIntervals([[[1, 5]], [[2, 4], [6, 7]]] as Interval[][])).toEqual([
      { count: 1, interval: [1, 2] },
      { count: 2, interval: [2, 4] },
      { count: 1, interval: [4, 5] },
      { count: 1, interval: [6, 7] },
    ])
  })

  test("handles three-overlapping input", () => {
    expect(combineIntervals([[[1, 5]], [[2, 6]], [[3, 4]]] as Interval[][])).toEqual([
      { count: 1, interval: [1, 2] },
      { count: 2, interval: [2, 3] },
      { count: 3, interval: [3, 4] },
      { count: 2, interval: [4, 5] },
      { count: 1, interval: [5, 6] },
    ])
  })
})