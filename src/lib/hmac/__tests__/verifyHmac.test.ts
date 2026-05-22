import { describe, expect, test } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { verifyHmac } from '../verifyHmac.js';

const secretBase64 = Buffer.from('test-secret-key').toString('base64');
const payload = '{"event":"envelope-completed","data":{}}';

function computeHmacLikeDocuSign(body: string, base64Secret: string): string {
  const keyBytes = Buffer.from(base64Secret, 'base64');
  return createHmac('sha256', keyBytes).update(body, 'utf8').digest('base64');
}

describe('verifyHmac', () => {
  test('returns true for a correct HMAC signature (Base64-encoded secret)', () => {
    const signature = computeHmacLikeDocuSign(payload, secretBase64);
    expect(verifyHmac(payload, signature, secretBase64)).toBe(true);
  });

  test('returns false for an incorrect HMAC signature', () => {
    expect(verifyHmac(payload, 'wrong-signature', secretBase64)).toBe(false);
  });

  test('returns false for an empty signature', () => {
    expect(verifyHmac(payload, '', secretBase64)).toBe(false);
  });
});
