import { z } from 'zod';
import { one } from '@clipforge/core/db';
import { withPublic, body, json, limit, clientIp, ApiError } from '@/lib/api';
import { createSession, verifyPassword } from '@/lib/auth';

const schema = z.object({
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().max(200),
});

// Constant-time-ish failure path: always run bcrypt so response time doesn't reveal which emails exist.
const DUMMY_HASH = '$2a$12$jfEsDOqFxXAadJiQcFteHe2M9haH7aJepzgbKHtBXlPs1OZ16KTp2';

export const POST = withPublic(async (req) => {
  const { email, password } = await body(req, schema);
  await limit(`login:${clientIp(req)}`, 20, 900);
  await limit(`login-email:${email}`, 10, 900);
  const user = await one<{ id: string; password_hash: string; suspended_at: string | null; suspended_reason: string | null }>(
    'select id, password_hash, suspended_at, suspended_reason from users where email = $1', [email],
  );
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new ApiError(401, 'Email or password is incorrect.');
  if (user.suspended_at) throw new ApiError(403, `This account is suspended${user.suspended_reason ? `: ${user.suspended_reason}` : '.'} Contact support if you think this is a mistake.`);
  await createSession(user.id, req.headers.get('user-agent'));
  return json({ ok: true });
});
