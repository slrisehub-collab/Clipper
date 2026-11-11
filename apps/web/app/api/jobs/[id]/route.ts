import { withUser, json } from '@/lib/api';
import { getJob, jobPublic } from '@/lib/data';

export const GET = withUser<{ id: string }>(async (_req, user, { id }) => {
  return json({ job: jobPublic(await getJob(user.id, id)) });
});
