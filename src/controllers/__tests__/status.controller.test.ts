import { describe, expect, test } from '@jest/globals';
import { statusParamsSchema } from '../status.controller.js';

describe('statusParamsSchema', () => {
  test('accepts numeric dealId', () => {
    const parsed = statusParamsSchema.parse({ dealId: '12345' });
    expect(parsed.dealId).toBe('12345');
  });

  test('rejects non-numeric dealId', () => {
    expect(() =>
      statusParamsSchema.parse({ dealId: 'abc' })
    ).toThrow();
  });

  test('rejects empty dealId', () => {
    expect(() =>
      statusParamsSchema.parse({ dealId: '' })
    ).toThrow();
  });
});
