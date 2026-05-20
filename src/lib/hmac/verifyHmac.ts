import { createHmac } from 'node:crypto';

export function verifyHmac(payload: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const computed = createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64');
  return computed === signature;
}
