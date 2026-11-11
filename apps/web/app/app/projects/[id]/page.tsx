import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { formatDuration, formatTimestamp } from '@clipforge/core/plan';
import { formatBytes } from '@clipforge/core/format';
import { getUserPlan } from '@clipforge/core/limits';
import { PageHeader } from '@/components/app-shell';
import { ClipGallery } from '@/components/clip-gallery';
import { ProjectActions } from '@/components/project-actions';
import { Card, Stat, StatusBadge } from '@/components/ui';
import { buttonClass } from '@/components/styles';
import { requireUser } from '@/lib/auth';
import { projectDetail, type JobPublic } from '@/lib/data';

const jobLabel = (j: JobPublic) => {
  const c = j.config;
  const what = c.method === 'custom' ? `${j.totalClips} custom clips` : c.method === 'count' ? `${c.count} equal clips` : `${formatDuration(c.segmentSeconds ?? 0)} clips`;
  return `${what}, ${c.format.toUpperCase()}${c.quality !== 'original' ? ` ${c.quality}p` : ''}${c.aspect !== 'original' ? ` ${c.aspect}` : ''}`;
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let d;
  try { d = await projectDetail(user.id, id); } catch { notFound(); }
  const plan = await getUserPlan(user.id);
  const v = d.video;
  const labels = Object.fromEntries(d.jobs.map((j) => [j.id, jobLabel(j)]));

  return (
    <>
      <PageHeader
        back={<Link href="/app/projects" className="mb-2 inline-flex items-center gap-1 text-[13px] text-mist-400 hover:text-mist-100"><ArrowLeft className="h-3.5 w-3.5" />Projects</Link>}
        title={d.project.name}
        actions={
          <>
            {v?.status === 'ready' && <Link href={`/app/new?video=${v.id}`} className={buttonClass('primary')}><Plus className="h-4 w-4" />New clips from this video</Link>}
            <ProjectActions id={d.project.id} name={d.project.name} afterDelete="list" />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-2 min-w-0 lg:order-1">
          <ClipGallery projectId={d.project.id} clips={d.clips} allowBatch={plan.allow_batch} jobLabels={labels} emptyHint={v?.status === 'ready' ? 'Create clips from this video to see them here.' : undefined} />
        </div>
        <div className="order-1 space-y-6 lg:order-2">
          <Card className="overflow-hidden">
            <div className="aspect-video bg-black">
              {v?.previewUrl ? <video src={v.previewUrl} poster={v.thumbUrl ?? undefined} controls playsInline preload="none" className="h-full w-full" /> : null}
            </div>
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-mist-200">Source video</span>
                {v && <StatusBadge status={v.status} />}
              </div>
              {v?.error && <p className="text-[13px] text-signal-red">{v.error}</p>}
              {v?.status !== 'ready' && v?.status !== 'failed' && v && <Link href={`/app/new?video=${v.id}`} className="text-[13px] text-volt-300 hover:underline">View progress</Link>}
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Duration" value={v?.duration ? formatTimestamp(v.duration) : '–'} />
                <Stat label="Resolution" value={v?.width ? `${v.width}×${v.height}` : '–'} />
                <Stat label="Size" value={formatBytes(v?.sizeBytes)} />
                <Stat label="Source" value={v?.sourceType === 'url' ? 'Link' : 'Upload'} />
              </div>
            </div>
          </Card>
          <Card>
            <div className="border-b border-white/[0.06] px-4 py-3 text-[13px] font-medium text-mist-200">Clipping jobs</div>
            {d.jobs.length ? (
              <ul className="divide-y divide-white/[0.05]">
                {d.jobs.map((j) => (
                  <li key={j.id}>
                    <Link href={`/app/jobs/${j.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.02]">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] text-mist-100">{labels[j.id]}</div>
                        <div className="text-[12px] text-mist-400">{j.completedClips}/{j.totalClips} clips · {new Date(j.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                      </div>
                      <StatusBadge status={j.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-4 text-[13px] text-mist-400">No jobs yet.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
