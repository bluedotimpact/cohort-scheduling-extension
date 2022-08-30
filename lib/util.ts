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
