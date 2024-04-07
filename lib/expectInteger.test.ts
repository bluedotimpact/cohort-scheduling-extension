import { describe, expect, test } from 'vitest';
import { expectInteger } from './expectInteger';

describe('expectInteger', () => {
  test('should return the number if it is an integer', () => {
    const input = 42;
    const result = expectInteger(input, '');
    expect(result).toBe(input);
  });

  test('should throw an error if the number is not an integer', () => {
    const input = 3.14;
    const errorMessage = 'Input must be an integer';
    expect(() => expectInteger(input, errorMessage)).toThrow(errorMessage);
  });

  test('should use the default error message if no error message is provided', () => {
    const input = 2.5;
    expect(() => expectInteger(input)).toThrow('Not an integer');
  });
});
