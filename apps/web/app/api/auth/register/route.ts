import { z } from 'zod';
import { one } from '@clipforge/core/db';
import { config } from '@clipforge/core/config';
import { withPublic, body, json, limit, clientIp, ApiError } from '@/lib/api';
import { createSession, hashPassword } from '@/lib/auth';

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
  password: z.string().min(8, 'Use at least 8 characters for your password.').max(200),
  name: z.string().trim().max(80).optional(),
});

export const POST = withPublic(async (req) => {
  await limit(`register:${clientIp(req)}`, 10, 3600);
  if (!config.allowRegistration) throw new ApiError(403, 'New registrations are currently closed.');
  const { email, password, name } = await body(req, schema);
  const existing = await one('select id from users where email = $1', [email]);
  if (existing) throw new ApiError(409, 'An account with this email already exists. Try signing in.');
  const user = await one<{ id: string }>(
    'insert into users (email, password_hash, display_name) values ($1, $2, $3) returning id',
    [email, await hashPassword(password), name || null],
  );
  await createSession(user!.id, req.headers.get('user-agent'));
  return json({ ok: true }, 201);
});
