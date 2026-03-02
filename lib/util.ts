import { Interval } from "weekly-availabilities";
import { MINUTES_IN_UNIT } from "./constants";

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

/** Converts availability intervals (in minutes) to unit indices, rounding inward to the nearest MINUTES_IN_UNIT boundary. */
export function toTimeAvUnits(timeAvMins: Interval[]): [number, number][] {
  return timeAvMins.map(([s, e]) => [
    Math.ceil(s / MINUTES_IN_UNIT),
    Math.floor(e / MINUTES_IN_UNIT),
  ] as [number, number]).filter(([s, e]) => s < e);
}
