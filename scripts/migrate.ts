// Applies db/migrations/*.sql in order, once each. Usage: npm run migrate
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const dir = path.resolve(import.meta.dirname, '../db/migrations');

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined });
  await client.connect();
  await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const applied = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`Applying ${f}`);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [f]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  }
  console.log('Migrations up to date.');
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
