import type { Interval } from "weekly-availabilities";
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

/** Returns the number of 30-min units of overlap between a person's availability and [t, t + meetingLength). */
export function getOverlapUnits(timeAvUnits: [number, number][], t: number, meetingLength: number): number {
  const meetingEnd = t + meetingLength;
  let totalOverlap = 0;
  for (const [b, e] of timeAvUnits) {
    const overlapStart = Math.max(t, b);
    const overlapEnd = Math.min(meetingEnd, e);
    if (overlapEnd > overlapStart) {
      totalOverlap += overlapEnd - overlapStart;
    }
  }
  return totalOverlap;
}

/** Returns the minimum gap (in units) between a person's availability and the meeting time [t, t + meetingLength). Returns 0 if any overlap exists. */
export function getDistanceUnits(timeAvUnits: [number, number][], t: number, meetingLength: number): number {
  const meetingEnd = t + meetingLength;
  let minDistance = Infinity;
  for (const [b, e] of timeAvUnits) {
    if (b < meetingEnd && e > t) return 0; // overlap exists
    const dist = Math.min(Math.abs(b - meetingEnd), Math.abs(e - t));
    if (dist < minDistance) minDistance = dist;
  }
  return minDistance === Infinity ? Infinity : minDistance;
}

/**
 * Parses a `UTC±HH:MM` offset string (e.g. "UTC+01:00", "UTC-05:30", "UTC00:00")
 * to minutes east of UTC. Returns null if the string is not in this format.
 */
function parseUtcOffsetMinutes(timezone: string): number | null {
  if (timezone === 'UTC' || timezone === 'UTC00:00') return 0;
  const match = /^UTC([+-])(\d{2}):(\d{2})$/.exec(timezone);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2]!, 10);
  const minutes = parseInt(match[3]!, 10);
  return sign * (hours * 60 + minutes);
}

/**
 * Converts a timezone string to synthetic availability representing 9am-9pm for the given days.
 * Accepts both IANA names (e.g. "Europe/London") and `UTC±HH:MM` offsets (e.g. "UTC+01:00").
 * Returns Interval[] in weekly minutes, same format as parseIntervals().
 */
function generateDefaultAvailabilityForDays(timezone: string, numDays: number): Interval[] {
  // Try the `UTC±HH:MM` offset format first (this is what the BlueDot availability app stores).
  let offsetMinutes = parseUtcOffsetMinutes(timezone);

  if (offsetMinutes === null) {
    // Fall back to IANA names via Intl.
    const now = new Date();
    const utcString = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzString = now.toLocaleString('en-US', { timeZone: timezone });
    const utcDate = new Date(utcString);
    const tzDate = new Date(tzString);
    offsetMinutes = (tzDate.getTime() - utcDate.getTime()) / 60000;
  }

  const intervals: Interval[] = [];
  for (let day = 0; day < numDays; day++) {
    const dayStartMinutes = day * 24 * 60;
    const start = dayStartMinutes + 9 * 60 - offsetMinutes;
    const end = dayStartMinutes + 21 * 60 - offsetMinutes;
    const clampedStart = Math.max(0, Math.min(10080, start));
    const clampedEnd = Math.max(0, Math.min(10080, end));
    if (clampedEnd > clampedStart) {
      intervals.push([clampedStart, clampedEnd] as Interval);
    }
  }
  return intervals;
}

/**
 * Converts an IANA timezone string to synthetic availability representing 9am-9pm Mon-Fri.
 */
export function generateDefaultAvailability(timezone: string): Interval[] {
  return generateDefaultAvailabilityForDays(timezone, 5);
}

/**
 * Converts an IANA timezone string to synthetic availability representing 9am-9pm all 7 days.
 * Used for intensive courses where participants may be available on any day.
 */
export function generateDefaultAvailabilityAllDays(timezone: string): Interval[] {
  return generateDefaultAvailabilityForDays(timezone, 7);
}

/**
 * Extracts unique time-of-day windows from availability intervals.
 * Returns [startMinuteInDay, endMinuteInDay] pairs, clamped to a single day.
 */
function extractTimeOfDayWindows(timeAvMins: Interval[]): [number, number][] {
  const MINUTES_IN_DAY = 24 * 60;
  const windows: [number, number][] = [];
  for (const [start, end] of timeAvMins) {
    const startOfDay = start % MINUTES_IN_DAY;
    const endOfDay = startOfDay + (end - start);
    const isDuplicate = windows.some(
      ([s, e]) => s === startOfDay && e === endOfDay
    );
    if (!isDuplicate) {
      windows.push([startOfDay, Math.min(endOfDay, MINUTES_IN_DAY)]);
    }
  }
  return windows;
}

/**
 * Expands a person's availability to all 7 days of the week.
 * Extracts time-of-day windows (ignoring which day) and replicates across Mon-Sun.
 * E.g., [Monday 13:00-15:00] → [Mon 13:00-15:00, Tue 13:00-15:00, ..., Sun 13:00-15:00]
 */
export function expandAvailability(timeAvMins: Interval[]): Interval[] {
  return expandAvailabilityToDays(timeAvMins, 7);
}

/**
 * Expands a person's availability to the first N days of the week.
 * Extracts time-of-day windows (ignoring which day) and replicates across days 0..numDays-1.
 * E.g., with numDays=5: [Monday 13:00-15:00] → [Mon-Fri 13:00-15:00]
 */
export function expandAvailabilityToDays(timeAvMins: Interval[], numDays: number): Interval[] {
  const MINUTES_IN_DAY = 24 * 60;
  const timeOfDayWindows = extractTimeOfDayWindows(timeAvMins);

  const expanded: Interval[] = [];
  for (let day = 0; day < numDays; day++) {
    const dayStart = day * MINUTES_IN_DAY;
    for (const [todStart, todEnd] of timeOfDayWindows) {
      const start = dayStart + todStart;
      const end = dayStart + todEnd;
      if (end <= 10080 && end > start) {
        expanded.push([start, end] as Interval);
      }
    }
  }
  return expanded;
}

/** Weekday indices (Mon=0 … Sun=6) covered by the inclusive [start, end] date span. */
export function weekdaysInRange(start: Date, end: Date): Set<number> {
  const days = new Set<number>();
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  for (let i = 0; i < 366 && d.getTime() <= last; i++) {
    days.add((d.getUTCDay() + 6) % 7); // JS Sun=0..Sat=6  ->  Mon=0..Sun=6
    d.setUTCDate(d.getUTCDate() + 1);
    if (days.size === 7) break;
  }
  return days;
}

/**
 * Collapse availability onto a single day for intensive scheduling. Keeps a time-of-day
 * only if it falls on >= minDays distinct days that are in relevantDays (the round's
 * meeting weekdays, Mon=0..Sun=6). Days outside relevantDays are ignored entirely.
 *
 * Replaces collapseAvailabilityToMonday(expandAvailability(...)) for intensives: the old
 * pipeline replicated a single day's window across the whole week, overstating who can
 * attend a course that meets at the same time every day. minDays=1 with all 7 relevant
 * days reproduces that old blanket behaviour.
 */
export function collapseIntensiveAvailability(
  timeAvMins: Interval[],
  relevantDays: Set<number>,
  minDays = 2,
): Interval[] {
  const MINUTES_IN_DAY = 24 * 60;
  const daysByMinute = new Map<number, Set<number>>(); // minute-of-day -> set of day indices
  for (const [start, end] of timeAvMins) {
    const day = Math.floor(start / MINUTES_IN_DAY);
    if (!relevantDays.has(day)) continue; // ignore non-meeting days (e.g. Sunday)
    const sod = start % MINUTES_IN_DAY;
    const eod = Math.min(sod + (end - start), MINUTES_IN_DAY); // clamp at midnight, as extractTimeOfDayWindows does
    for (let m = sod; m < eod; m++) {
      let s = daysByMinute.get(m);
      if (!s) { s = new Set(); daysByMinute.set(m, s); }
      s.add(day);
    }
  }
  const kept = [...daysByMinute.entries()]
    .filter(([, days]) => days.size >= minDays)
    .map(([m]) => m)
    .sort((a, b) => a - b);
  const merged: Interval[] = [];
  for (const m of kept) {
    const last = merged[merged.length - 1];
    if (last && m === last[1]) merged[merged.length - 1] = [last[0], m + 1] as Interval;
    else merged.push([m, m + 1] as Interval);
  }
  return merged;
}

/**
 * Collapses availability from all days onto Monday by extracting time-of-day windows
 * and merging them onto day 0. Used for intensive courses where scheduling is per-day.
 * E.g., Mon-Fri 9:00-12:00 + Sat-Sun 15:00-17:00 → Monday: 9:00-12:00, 15:00-17:00
 */
export function collapseAvailabilityToMonday(timeAvMins: Interval[]): Interval[] {
  const timeOfDayWindows = extractTimeOfDayWindows(timeAvMins);

  // Sort by start time
  timeOfDayWindows.sort((a, b) => a[0] - b[0]);

  // Merge overlapping/adjacent intervals
  const merged: Interval[] = [];
  for (const [start, end] of timeOfDayWindows) {
    if (merged.length > 0) {
      const last = merged[merged.length - 1]!;
      if (start <= last[1]) {
        // Overlapping or adjacent — extend
        merged[merged.length - 1] = [last[0], Math.max(last[1], end)] as Interval;
        continue;
      }
    }
    merged.push([start, end] as Interval);
  }

  return merged;
}
