import { describe, expect, test } from 'vitest';
import { WeeklyTime } from 'weekly-availabilities';
import { toTimeAvUnits } from './util';

/** Monday at given hour:minute in weekly minutes */
function mon(hour: number, minute = 0): WeeklyTime {
  return (hour * 60 + minute) as WeeklyTime;
}

describe('toTimeAvUnits (availability rounding to 30-min boundaries)', () => {
  test('availability with 15-min offset rounds inward (Nepal UTC+05:45 case)', () => {
    // Someone available 12:15 - 15:15 UTC (Nepal local 18:00 - 21:00)
    const result = toTimeAvUnits([[mon(12, 15), mon(15, 15)]]);
    // ceil(735/30)=25, floor(915/30)=30 → available 12:30-15:00
    expect(result).toEqual([[25, 30]]);
  });

  test('narrow availability that becomes empty after rounding is filtered out', () => {
    // Available 9:15 - 9:30 — only 15 minutes, doesn't span a full 30-min block
    const result = toTimeAvUnits([[mon(9, 15), mon(9, 30)]]);
    expect(result).toEqual([]);
  });
});
