import { redis } from './queue';

export interface RateResult { ok: boolean; remaining: number; resetSec: number }

/** Fixed-window limiter in Redis. Fails open if Redis is unreachable so the app stays usable. */
export async function rateLimit(bucket: string, limit: number, windowSec: number): Promise<RateResult> {
  const key = `rl:${bucket}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  try {
    const r = redis();
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, windowSec + 1);
    return { ok: n <= limit, remaining: Math.max(0, limit - n), resetSec: windowSec };
  } catch {
    return { ok: true, remaining: limit, resetSec: windowSec };
  }
}
