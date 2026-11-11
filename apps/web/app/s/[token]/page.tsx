import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Download } from 'lucide-react';
import { one } from '@clipforge/core/db';
import { storage } from '@clipforge/core/storage';
import { formatDuration } from '@clipforge/core/plan';
import { formatBytes, slugify } from '@clipforge/core/format';
import { Logo } from '@/components/logo';
import { buttonClass } from '@/components/styles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Shared clip', robots: { index: false } };

export default async function SharedClip({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{10,64}$/.test(token)) notFound();
  const c = await one<{ storage_key: string; thumb_key: string | null; idx: number; duration_sec: number; size_bytes: number; format: string; project_name: string; suspended: boolean }>(
    `select c.storage_key, c.thumb_key, c.idx, c.duration_sec, c.size_bytes, c.format, p.name as project_name, (u.suspended_at is not null) as suspended
       from clips c join projects p on p.id = c.project_id join users u on u.id = c.user_id where c.share_token = $1`, [token]);
  if (!c || c.suspended) notFound();
  const name = `${slugify(c.project_name)}-clip-${String(c.idx).padStart(3, '0')}.${c.format}`;
  const [play, dl, thumb] = await Promise.all([
    storage().signedUrl(c.storage_key, { expiresIn: 4 * 3600 }),
    storage().signedUrl(c.storage_key, { expiresIn: 4 * 3600, downloadName: name }),
    c.thumb_key ? storage().signedUrl(c.thumb_key, { expiresIn: 4 * 3600 }) : Promise.resolve(null),
  ]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-4 py-6 sm:px-6">
      <Logo />
      <div className="flex flex-1 flex-col justify-center py-10">
        <video src={play} poster={thumb ?? undefined} controls playsInline className="aspect-video w-full rounded-xl bg-black" />
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-mist-50">{c.project_name}: clip {c.idx}</h1>
            <p className="text-sm text-mist-400">{formatDuration(c.duration_sec)} · {formatBytes(c.size_bytes)} · {c.format.toUpperCase()}</p>
          </div>
          <a href={dl} className={buttonClass('primary')}><Download className="h-4 w-4" />Download</a>
        </div>
      </div>
      <p className="text-center text-[12px] text-mist-500">Shared with ClipForge.</p>
    </div>
  );
}
