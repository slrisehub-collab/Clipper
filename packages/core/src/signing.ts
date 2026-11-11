import crypto from 'node:crypto';
import { config } from './config';

function hmac(data: string): string {
  return crypto.createHmac('sha256', config.signingSecret).update(data).digest('base64url');
}

export function sign(parts: (string | number)[]): string {
  return hmac(parts.join('\n'));
}

export function verify(parts: (string | number)[], sig: string): boolean {
  const expected = Buffer.from(sign(parts));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}
