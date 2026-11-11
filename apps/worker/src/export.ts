import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import archiver from 'archiver';
import { one, query, logError } from '@clipforge/core/db';
import { config } from '@clipforge/core/config';
import { storage, keys } from '@clipforge/core/storage';
import { slugify } from '@clipforge/core/format';
import type { ClipRow } from '@clipforge/core/types';

const EXPORT_TTL_HOURS = 24;

/** Builds a ZIP on disk by streaming each clip in turn (memory use stays flat for large sets). */
export async function processExportJob(exportId: string) {
  const exp = await one<{ id: string; user_id: string; project_id: string; clip_ids: string[]; status: string }>('select * from exports where id = $1', [exportId]);
  if (!exp || exp.status === 'completed') return;
  await query(`update exports set status = 'processing', progress = 0, error = null, updated_at = now() where id = $1`, [exportId]);
  const workDir = path.join(config.tmpDir, `export-${exportId}`);
  await fsp.mkdir(workDir, { recursive: true });
  const zipPath = path.join(workDir, 'clips.zip');
  try {
    // Ownership is re-checked here: only clips belonging to the export's owner are included.
    const clips = await query<ClipRow & { project_name: string }>(
      `select c.*, p.name as project_name from clips c join projects p on p.id = c.project_id
       where c.id = any($1::uuid[]) and c.user_id = $2 order by c.job_id, c.idx`,
      [exp.clip_ids, exp.user_id],
    );
    if (!clips.length) throw new Error('None of the selected clips exist any more.');
    const base = slugify(clips[0].project_name);
    const multipleJobs = new Set(clips.map((c) => c.job_id)).size > 1;

    const out = fs.createWriteStream(zipPath);
    const zip = archiver('zip', { store: true }); // video is already compressed; storing is faster and no larger
    const finished = new Promise<void>((res, rej) => { out.on('close', () => res()); zip.on('error', rej); out.on('error', rej); });
    zip.pipe(out);
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const stream = await storage().readStream(c.storage_key);
      const prefix = multipleJobs ? `${c.job_id.slice(0, 8)}-` : '';
      zip.append(stream, { name: `${base}-${prefix}clip-${String(c.idx).padStart(3, '0')}.${c.format}` });
      // Wait for this entry to be written before opening the next stream.
      await new Promise<void>((res, rej) => { stream.once('end', res); stream.once('error', rej); });
      await query('update exports set progress = $2, updated_at = now() where id = $1', [exportId, (i + 1) / clips.length]);
    }
    await zip.finalize();
    await finished;
    const key = keys.export(exp.user_id, exportId);
    const size = await storage().putFile(key, zipPath, 'application/zip');
    await query(
      `update exports set status = 'completed', progress = 1, storage_key = $2, size_bytes = $3, expires_at = now() + interval '${EXPORT_TTL_HOURS} hours', updated_at = now() where id = $1`,
      [exportId, key, size],
    );
  } catch (e) {
    await query(`update exports set status = 'failed', error = $2, updated_at = now() where id = $1`, [exportId, (e as Error).message.slice(0, 300)]);
    await logError('worker', 'export', e, { userId: exp.user_id });
    throw e;
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}
