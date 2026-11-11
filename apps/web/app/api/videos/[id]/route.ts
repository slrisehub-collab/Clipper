import { withUser, json } from '@/lib/api';
import { getVideo, videoPublic } from '@/lib/data';

export const GET = withUser<{ id: string }>(async (_req, user, { id }) => {
  return json({ video: await videoPublic(await getVideo(user.id, id)) });
});
