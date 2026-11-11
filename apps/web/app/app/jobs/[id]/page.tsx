import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { JobProgress } from '@/components/job-progress';
import { requireUser } from '@/lib/auth';
import { getJob, jobPublic, projectDetail } from '@/lib/data';
import { getUserPlan } from '@clipforge/core/limits';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let job;
  try { job = await getJob(user.id, id); } catch { notFound(); }
  const [detail, plan] = await Promise.all([projectDetail(user.id, job.project_id), getUserPlan(user.id)]);
  return (
    <>
      <PageHeader
        back={<Link href={`/app/projects/${job.project_id}`} className="mb-2 inline-flex items-center gap-1 text-[13px] text-mist-400 hover:text-mist-100"><ArrowLeft className="h-3.5 w-3.5" />{detail.project.name}</Link>}
        title="Processing"
      />
      <JobProgress initialJob={jobPublic(job)} projectName={detail.project.name} clips={detail.clips.filter((c) => c.jobId === job.id)} allowBatch={plan.allow_batch} />
    </>
  );
}
