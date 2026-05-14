import { describe, expect, test } from '@jest/globals';
import { sendEnvelopeBodySchema } from '../envelopes.controller.js';

describe('sendEnvelopeBodySchema', () => {
  const baseValid = { dealId: '12345', templateId: 'tpl-1', contactId: '67890' };

  test('acepta body sin directionId (forward-compat)', () => {
    const parsed = sendEnvelopeBodySchema.parse(baseValid);
    expect(parsed.directionId).toBeUndefined();
  });

  test('acepta body con directionId válido', () => {
    const parsed = sendEnvelopeBodySchema.parse({ ...baseValid, directionId: 'dir-1' });
    expect(parsed.directionId).toBe('dir-1');
  });

  test('rechaza directionId vacío', () => {
    expect(() =>
      sendEnvelopeBodySchema.parse({ ...baseValid, directionId: '' })
    ).toThrow();
  });

  test('rechaza dealId no numérico', () => {
    expect(() =>
      sendEnvelopeBodySchema.parse({ ...baseValid, dealId: 'abc' })
    ).toThrow();
  });
});
