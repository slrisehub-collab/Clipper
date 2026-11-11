import type { Metadata } from 'next';
import { Workspace } from '@/components/workspace/workspace';
import { PageHeader } from '@/components/app-shell';
import { requireUser } from '@/lib/auth';
import { getVideo, videoPublic } from '@/lib/data';
import { usageSummary } from '@clipforge/core/limits';

export const metadata: Metadata = { title: 'New project' };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ video?: string }> }) {
  const user = await requireUser();
  const { video: videoId } = await searchParams;
  const usage = await usageSummary(user.id);
  let initial = null;
  if (videoId) {
    try { initial = await videoPublic(await getVideo(user.id, videoId)); } catch { initial = null; }
  }
  return (
    <>
      <PageHeader
        title={initial ? 'New clips' : 'New project'}
        description={initial ? 'Make another set of clips from this video.' : 'Upload or link a video, choose how to split it, and generate your clips.'}
      />
      <Workspace
        initialVideo={initial}
        limits={{
          maxUploadBytes: usage.plan.max_upload_bytes,
          storageFree: Math.max(0, usage.storageLimit - usage.storageUsed),
          maxDurationSec: usage.plan.max_source_duration_sec,
          planName: usage.plan.name,
        }}
      />
    </>
  );
}
