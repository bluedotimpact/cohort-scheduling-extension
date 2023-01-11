import { Interval } from "./parse";

export async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function newUID() {
  return Math.random().toString(36).substring(2, 10);
}

export function parseCommaSeparatedNumberList(list: string): number[] | undefined {
  const result = list
    .split(",")
    .filter((s) => s.trim().length !== 0)
    .map((s) => parseInt(s, 10));
  if (!result.some((n) => isNaN(n))) {
    return result;
  }
}

export function isWithin(interval: Interval, n: number): boolean {
  return interval[0] <= n && n < interval[1]
}

function flattenIntervals(intervals: Interval[]): Interval[] {
  return combineIntervalsWithoutFlattening(intervals).map(v => v.interval);
}

interface CombinedInterval {
  count: number,
  interval: Interval,
}

export function combineIntervals(intervals: Interval[][]): CombinedInterval[] {
  // Ensure each person's intervals don't overlap with themselves
  const flattened = intervals.map(flattenIntervals).flat()

  return combineIntervalsWithoutFlattening(flattened)
}

function combineIntervalsWithoutFlattening(intervals: Interval[]): CombinedInterval[] {
  // Convert to intermediate representation, so we can scan over time linearly
  const intervalEvents = intervals.flatMap(interval => [
    { type: "start", at: interval[0] },
    { type: "end", at: interval[1] },
  ]).sort((a, b) => a.at - b.at)

  const result: CombinedInterval[] = [];
  for (const event of intervalEvents) {
    // Close the last interval
    const lastInterval = result[result.length - 1];
    if (lastInterval) {
      lastInterval.interval[1] = event.at;
    }

    result.push({
      count: (lastInterval?.count ?? 0) + (event.type === "start" ? 1 : -1),
      interval: [event.at, undefined]
    })
  }

  // Remove empty or non-overlapping areas
  return result.filter(i => i.count > 0 && i.interval[1] > i.interval[0]);
}
