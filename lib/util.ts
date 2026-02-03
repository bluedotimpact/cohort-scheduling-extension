import { type Interval } from 'weekly-availabilities';

export async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function newUID() {
  return Math.random().toString(36).substring(2, 10);
}

/** Check if two date ranges overlap */
export function dateRangesOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
  return start1 <= end2 && start2 <= end1;
}

// TODO: move to `weekly-availabilities`
/** Subtract blocked intervals from availability intervals.
 * Returns new availability with blocked times removed. */
export function subtractIntervals(availability: Interval[], blocked: Interval[]): Interval[] {
  if (blocked.length === 0) return availability;

  const result: Interval[] = [];

  for (const [availStart, availEnd] of availability) {
    let remaining: Interval[] = [[availStart, availEnd]];

    for (const [blockStart, blockEnd] of blocked) {
      const newRemaining: Interval[] = [];

      for (const [remStart, remEnd] of remaining) {
        if (blockEnd <= remStart || blockStart >= remEnd) {
          newRemaining.push([remStart, remEnd]);
        } else {
          if (remStart < blockStart) {
            newRemaining.push([remStart, blockStart]);
          }
          if (remEnd > blockEnd) {
            newRemaining.push([blockEnd, remEnd]);
          }
        }
      }

      remaining = newRemaining;
    }

    result.push(...remaining);
  }

  return result;
}
