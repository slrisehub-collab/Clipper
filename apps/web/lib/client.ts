'use client';

export class ClientError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

/** JSON fetch against our API with readable errors. */
export async function api<T = any>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ClientError('Network problem. Check your connection and try again.', 0);
  }
  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth')) {
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
    }
    throw new ClientError(data?.error ?? `Request failed (${res.status}).`, res.status, data?.code);
  }
  return data as T;
}

export function newIdempotencyKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
