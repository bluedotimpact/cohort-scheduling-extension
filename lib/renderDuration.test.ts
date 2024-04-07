import { describe, expect, test } from 'vitest';
import { renderDuration } from './renderDuration';

describe('renderDuration', () => {
  test('should return the duration in milliseconds for values less than 1000', () => {
    expect(renderDuration(500)).toBe('500ms');
    expect(renderDuration(0)).toBe('0ms');
  });

  test('should return the duration in seconds for values between 1000 and 60000', () => {
    expect(renderDuration(1000)).toBe('1s');
    expect(renderDuration(30000)).toBe('30s');
    expect(renderDuration(59000)).toBe('59s');
  });

  test('should return the duration in minutes for values between 60000 and 3600000', () => {
    expect(renderDuration(60000)).toBe('1m');
    expect(renderDuration(80000)).toBe('1m');
    expect(renderDuration(120000)).toBe('2m');
    expect(renderDuration(3540000)).toBe('59m');
  });

  test('should return the duration in hours and minutes for values greater than 3600000', () => {
    expect(renderDuration(3600000)).toBe('1h:00m');
    expect(renderDuration(7200000)).toBe('2h:00m');
    expect(renderDuration(10800000)).toBe('3h:00m');
    expect(renderDuration(86400000)).toBe('24h:00m');
  });

  test('should handle negative values by prefixing with a minus sign', () => {
    expect(renderDuration(-500)).toBe('-500ms');
    expect(renderDuration(-60000)).toBe('-1m');
    expect(renderDuration(-3600000)).toBe('-1h:00m');
  });
});
