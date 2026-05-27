import { describe, expect, test } from '@jest/globals';
import { voidEnvelopeBodySchema, voidEnvelopeParamsSchema } from '../void.controller.js';

describe('voidEnvelopeBodySchema', () => {
  test('accepts valid body with dealId and reason >= 5 chars', () => {
    const parsed = voidEnvelopeBodySchema.parse({ dealId: '123', reason: 'Error en los datos' });
    expect(parsed.reason).toBe('Error en los datos');
    expect(parsed.dealId).toBe('123');
  });

  test('rejects reason shorter than 5 chars', () => {
    expect(() =>
      voidEnvelopeBodySchema.parse({ dealId: '123', reason: 'ab' })
    ).toThrow();
  });

  test('rejects missing reason', () => {
    expect(() =>
      voidEnvelopeBodySchema.parse({ dealId: '123' })
    ).toThrow();
  });

  test('rejects non-numeric dealId', () => {
    expect(() =>
      voidEnvelopeBodySchema.parse({ dealId: 'abc', reason: 'Razón válida' })
    ).toThrow();
  });
});

describe('voidEnvelopeParamsSchema', () => {
  test('accepts non-empty envelopeId', () => {
    const parsed = voidEnvelopeParamsSchema.parse({ envelopeId: 'env-abc' });
    expect(parsed.envelopeId).toBe('env-abc');
  });

  test('rejects empty envelopeId', () => {
    expect(() =>
      voidEnvelopeParamsSchema.parse({ envelopeId: '' })
    ).toThrow();
  });
});
