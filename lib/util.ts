
export async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function newUID() {
  return Math.random().toString(36).substring(2, 10);
}

export function parseCommaSeparatedNumberList(list: string): number[] | null {
  const result = list
    .split(",")
    .filter((s) => s.trim().length !== 0)
    .map((s) => parseInt(s, 10));
  if (!result.some((n) => isNaN(n))) {
    return result;
  }
}

export function isWithin(interval, n) {
  if (interval[0] <= n && n < interval[1]) {
    return true;
  }
}

function intersectIntervals([x1, x2], [y1, y2]) {
  if (x1 > y2 || x2 < y1) {
    return null;
  } else {
    return [Math.max(x1, y1), Math.min(x2, y2)];
  }
}

export function intersectIntervalArrays(intervals1, intervals2) {
  if (!intervals1) {
    return intervals2;
  }
  let result = [];
  for (const interval1 of intervals1) {
    for (const interval2 of intervals2) {
      const intersection = intersectIntervals(interval1, interval2);
      if (intersection) {
        result.push(intersection);
      }
    }
  }
  return result;
}

export function findOverlapGroup(people) {
  return people.reduce(intersectIntervalArrays);
}
