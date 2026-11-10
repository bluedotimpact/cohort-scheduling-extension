import { describe, expect, test } from 'vitest';
import { emailsMatch } from './facilitatorUtils';

describe('emailsMatch', () => {
  test('matches the same email', () => {
    expect(emailsMatch('alice@example.com', 'alice@example.com')).toBe(true);
  });

  test('does not match different emails', () => {
    expect(emailsMatch('alice@example.com', 'bob@example.com')).toBe(false);
  });

  test('matches a facilitator in a co-facilitated group', () => {
    expect(emailsMatch('bob@example.com, alice@example.com', 'alice@example.com')).toBe(true);
  });

  test('ignores case and surrounding whitespace', () => {
    expect(emailsMatch(' Alice@Example.com ', 'alice@example.COM')).toBe(true);
  });
});
