import { withPublic, json } from '@/lib/api';
import { destroySession } from '@/lib/auth';

export const POST = withPublic(async () => {
  await destroySession();
  return json({ ok: true });
});
