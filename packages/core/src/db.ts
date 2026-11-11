import pg from 'pg';
import { config } from './config';

// Return bigint columns as numbers (sizes stay well under 2^53).
pg.types.setTypeParser(20, (v) => Number(v));

const g = globalThis as unknown as { __clipforgePool?: pg.Pool };

export function pool(): pg.Pool {
  if (!g.__clipforgePool) {
    g.__clipforgePool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
    });
  }
  return g.__clipforgePool;
}

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params as any[]);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function logError(source: string, context: string, err: unknown, extra: { userId?: string | null; jobId?: string | null; details?: unknown } = {}) {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await query(
      'insert into system_errors (source, context, message, details, user_id, job_id) values ($1,$2,$3,$4,$5,$6)',
      [source, context, message.slice(0, 2000), extra.details ? JSON.stringify(extra.details) : null, extra.userId ?? null, extra.jobId ?? null],
    );
  } catch {
    // never let error logging throw
  }
  console.error(`[${source}] ${context}:`, err);
}
