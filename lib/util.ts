export async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function newUID() {
  return Math.random().toString(36).substring(2, 10);
}

/** Check if two date ranges overlap */
export function dateRangesOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
  return start1 < end2 && start2 < end1;
}
