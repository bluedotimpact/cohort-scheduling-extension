import { describe, expect, test } from 'vitest';
import { WeeklyTime } from 'weekly-availabilities';
import { MINUTES_IN_UNIT } from './constants';
import { toTimeAvUnits } from './util';

/** Monday at given hour:minute in weekly minutes */
function mon(hour: number, minute = 0): WeeklyTime {
  return (hour * 60 + minute) as WeeklyTime;
}

/** Convert hour:minute to unit index for readable assertions */
function unit(hour: number, minute = 0): number {
  return (hour * 60 + minute) / MINUTES_IN_UNIT;
}

describe('toTimeAvUnits (availability rounding to 30-min boundaries)', () => {
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
