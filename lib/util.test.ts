import { describe, expect, test } from 'vitest';
import { Interval, WeeklyTime } from 'weekly-availabilities';
import { MINUTES_IN_UNIT } from './constants';
import { collapseAvailabilityToMonday, collapseIntensiveAvailability, expandAvailabilityToDays, generateDefaultAvailability, toTimeAvUnits, weekdaysInRange } from './util';

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

describe('weekdaysInRange', () => {
  test('Mon->Sat span yields Mon-Sat (no Sunday)', () => {
    // 2026-06-08 is a Monday, 2026-06-13 a Saturday (Jun W24 intensive)
    const result = weekdaysInRange(new Date(Date.UTC(2026, 5, 8)), new Date(Date.UTC(2026, 5, 13)));
    expect([...result].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('single day yields just that weekday', () => {
    const result = weekdaysInRange(new Date(Date.UTC(2026, 5, 13)), new Date(Date.UTC(2026, 5, 13)));
    expect([...result]).toEqual([5]); // Saturday
  });

  test('span over a week yields all 7 weekdays', () => {
    const result = weekdaysInRange(new Date(Date.UTC(2026, 5, 8)), new Date(Date.UTC(2026, 5, 20)));
    expect(result.size).toBe(7);
  });
});

describe('collapseIntensiveAvailability', () => {
  const monToSat = new Set([0, 1, 2, 3, 4, 5]);

  test('drops a time-of-day that occurs on only one day', () => {
    expect(collapseIntensiveAvailability([dayInterval(0, 13, 14)], monToSat)).toEqual([]);
  });

  test('keeps a time-of-day that recurs on two days, collapsed to Monday', () => {
    const intervals: Interval[] = [dayInterval(0, 13, 14), dayInterval(2, 13, 14)];
    expect(collapseIntensiveAvailability(intervals, monToSat)).toEqual([dayInterval(0, 13, 14)]);
  });

  test('ignores days outside relevantDays (Sunday does not count toward the 2)', () => {
    const intervals: Interval[] = [dayInterval(0, 13, 14), dayInterval(6, 13, 14)]; // Mon + Sun
    expect(collapseIntensiveAvailability(intervals, monToSat)).toEqual([]);
  });

  test('Saturday counts when it is in relevantDays', () => {
    const intervals: Interval[] = [dayInterval(4, 13, 14), dayInterval(5, 13, 14)]; // Fri + Sat
    expect(collapseIntensiveAvailability(intervals, monToSat)).toEqual([dayInterval(0, 13, 14)]);
  });

  test('keeps only the minutes that recur on >=2 days', () => {
    const intervals: Interval[] = [dayInterval(0, 13, 17), dayInterval(2, 13, 15)];
    expect(collapseIntensiveAvailability(intervals, monToSat)).toEqual([dayInterval(0, 13, 15)]);
  });

  test('minDays=1 over all days reproduces blanket collapse', () => {
    const allDays = new Set([0, 1, 2, 3, 4, 5, 6]);
    const intervals: Interval[] = [dayInterval(0, 9, 12), dayInterval(5, 15, 17)];
    expect(collapseIntensiveAvailability(intervals, allDays, 1)).toEqual([
      dayInterval(0, 9, 12),
      dayInterval(0, 15, 17),
    ]);
  });

  test('handles empty input', () => {
    expect(collapseIntensiveAvailability([], monToSat)).toEqual([]);
  });
});

describe('generateDefaultAvailability', () => {
  test('UTC+01:00 produces 9am-9pm Mon-Fri shifted -1h to UTC', () => {
    // 9am-9pm local in UTC+01:00 is 8am-8pm UTC.
    const result = generateDefaultAvailability('UTC+01:00');
    expect(result).toEqual([
      dayInterval(0, 8, 20),
      dayInterval(1, 8, 20),
      dayInterval(2, 8, 20),
      dayInterval(3, 8, 20),
      dayInterval(4, 8, 20),
    ]);
  });

  test('UTC+10:00 produces 9am-9pm Mon-Fri shifted -10h to UTC (clamped at week start)', () => {
    // 9am Mon local in UTC+10:00 is 23:00 Sunday UTC, clamped to start of week.
    // 9pm Fri local is 11:00 Fri UTC.
    const result = generateDefaultAvailability('UTC+10:00');
    // Mon: clamped to [0, 660] (starts at 0 because -180min would be Sunday)
    // Tue-Fri: [day*1440 - 60, day*1440 + 660] (e.g. Tue 23:00-Tue 11:00 next day = no, recompute)
    // Actually start = day*1440 + 540 - 600 = day*1440 - 60. End = day*1440 + 1260 - 600 = day*1440 + 660.
    expect(result[0]).toEqual([0, 660]); // Mon, clamped
    expect(result[1]).toEqual([1380, 2100]); // Tue-1h
    expect(result[4]).toEqual([5700, 6420]); // Fri-1h
  });

  test('UTC00:00 produces 9am-9pm Mon-Fri exactly', () => {
    const result = generateDefaultAvailability('UTC00:00');
    expect(result).toEqual([
      dayInterval(0, 9, 21),
      dayInterval(1, 9, 21),
      dayInterval(2, 9, 21),
      dayInterval(3, 9, 21),
      dayInterval(4, 9, 21),
    ]);
  });

  test('IANA timezone names still work as fallback', () => {
    // Just check it doesn't throw and returns 5 weekday intervals.
    const result = generateDefaultAvailability('Europe/London');
    expect(result).toHaveLength(5);
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
