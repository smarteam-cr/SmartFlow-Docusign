import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmac(payload: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const secretBytes = Buffer.from(secret, 'base64');
  const computed = createHmac('sha256', secretBytes)
    .update(payload, 'utf8')
    .digest('base64');
  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
