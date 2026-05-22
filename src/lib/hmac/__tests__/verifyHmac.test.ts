import { describe, expect, test } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { verifyHmac } from '../verifyHmac.js';

const secret = 'test-secret-key';
const payload = '{"event":"envelope-completed","data":{}}';

function computeHmac(body: string, key: string): string {
  return createHmac('sha256', key).update(body, 'utf8').digest('base64');
}

describe('verifyHmac', () => {
  test('returns true for a correct HMAC signature', () => {
    const signature = computeHmac(payload, secret);
    expect(verifyHmac(payload, signature, secret)).toBe(true);
  });

  test('returns false for an incorrect HMAC signature', () => {
    expect(verifyHmac(payload, 'wrong-signature', secret)).toBe(false);
  });

  test('returns false for an empty signature', () => {
    expect(verifyHmac(payload, '', secret)).toBe(false);
  });
});
