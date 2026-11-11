import { withUser, json } from '@/lib/api';
import { listProjects } from '@/lib/data';

export const GET = withUser(async (req, user) => {
  const search = req.nextUrl.searchParams.get('q') ?? undefined;
  return json({ projects: await listProjects(user.id, { search }) });
});
