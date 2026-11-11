// Promotes an existing account to admin. Usage: npm run make-admin -- someone@example.com
import 'dotenv/config';
import pg from 'pg';

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  if (!email) { console.error('Usage: npm run make-admin -- <email>'); process.exit(1); }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const r = await client.query(`update users set role = 'admin', updated_at = now() where email = $1 returning id`, [email]);
  console.log(r.rowCount ? `${email} is now an admin.` : `No account found for ${email}. Register first.`);
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
