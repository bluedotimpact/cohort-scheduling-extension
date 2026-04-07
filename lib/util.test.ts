import { describe, expect, test } from 'vitest';
import { Interval, WeeklyTime } from 'weekly-availabilities';
import { MINUTES_IN_UNIT } from './constants';
import { collapseAvailabilityToMonday, expandAvailabilityToDays, toTimeAvUnits } from './util';

/** Monday at given hour:minute in weekly minutes */
function mon(hour: number, minute = 0): WeeklyTime {
  return (hour * 60 + minute) as WeeklyTime;
}

/** Convert hour:minute to unit index for readable assertions */
function unit(hour: number, minute = 0): number {
  return (hour * 60 + minute) / MINUTES_IN_UNIT;
}

describe('toTimeAvUnits (availability rounding to 30-min boundaries)', () => {
  test('aligned availability is preserved exactly', () => {
    const result = toTimeAvUnits([[mon(9, 0), mon(12, 0)]]);
    expect(result).toEqual([[unit(9, 0), unit(12, 0)]]);
  });

  test('availability with 15-min offset rounds inward (Nepal UTC+05:45 case)', () => {
    // Someone available 12:15 - 15:15 UTC (Nepal local 18:00 - 21:00)
    const result = toTimeAvUnits([[mon(12, 15), mon(15, 15)]]);
    // Rounds inward: 12:15 → 12:30, 15:15 → 15:00
    expect(result).toEqual([[unit(12, 30), unit(15, 0)]]);
  });

  test('narrow availability that becomes empty after rounding is filtered out', () => {
    // Available 9:15 - 9:30 — only 15 minutes, doesn't span a full 30-min block
    const result = toTimeAvUnits([[mon(9, 15), mon(9, 30)]]);
    expect(result).toEqual([]);
  });
});

const MINUTES_IN_DAY = 24 * 60;

/** Helper to create an interval on a specific day (0=Mon, 1=Tue, etc.) */
function dayInterval(day: number, startHour: number, endHour: number, startMin = 0, endMin = 0): Interval {
  const dayStart = day * MINUTES_IN_DAY;
  return [dayStart + startHour * 60 + startMin, dayStart + endHour * 60 + endMin] as Interval;
}

describe('collapseAvailabilityToMonday', () => {
  test('collapses weekday availability to Monday', () => {
    // Mon-Fri 9:00-12:00 (same time each day)
    const intervals: Interval[] = [];
    for (let day = 0; day < 5; day++) {
      intervals.push(dayInterval(day, 9, 12));
    }
    const result = collapseAvailabilityToMonday(intervals);
    // Should collapse to a single Monday 9:00-12:00
    expect(result).toEqual([dayInterval(0, 9, 12)]);
  });

  test('merges different time windows from different days', () => {
    // Mon-Fri 9:00-12:00, Sat-Sun 15:00-17:00
    const intervals: Interval[] = [];
    for (let day = 0; day < 5; day++) {
      intervals.push(dayInterval(day, 9, 12));
    }
    for (let day = 5; day < 7; day++) {
      intervals.push(dayInterval(day, 15, 17));
    }
    const result = collapseAvailabilityToMonday(intervals);
    expect(result).toEqual([
      dayInterval(0, 9, 12),
      dayInterval(0, 15, 17),
    ]);
  });

  test('merges overlapping windows from different days', () => {
    // Monday 9:00-12:00 and Tuesday 11:00-14:00
    const intervals: Interval[] = [
      dayInterval(0, 9, 12),
      dayInterval(1, 11, 14),
    ];
    const result = collapseAvailabilityToMonday(intervals);
    // Should merge to Monday 9:00-14:00
    expect(result).toEqual([dayInterval(0, 9, 14)]);
  });

  test('handles empty input', () => {
    expect(collapseAvailabilityToMonday([])).toEqual([]);
  });
});

describe('expandAvailabilityToDays', () => {
  test('expands to 5 days', () => {
    const intervals: Interval[] = [dayInterval(0, 9, 12)];
    const result = expandAvailabilityToDays(intervals, 5);
    expect(result).toEqual([
      dayInterval(0, 9, 12),
      dayInterval(1, 9, 12),
      dayInterval(2, 9, 12),
      dayInterval(3, 9, 12),
      dayInterval(4, 9, 12),
    ]);
  });

  test('expands to 1 day (Monday only)', () => {
    const intervals: Interval[] = [dayInterval(2, 10, 11)]; // Wednesday 10-11
    const result = expandAvailabilityToDays(intervals, 1);
    expect(result).toEqual([dayInterval(0, 10, 11)]);
  });
});
