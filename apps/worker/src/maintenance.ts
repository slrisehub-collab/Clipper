import fsp from 'node:fs/promises';
import path from 'node:path';
import { query, logError } from '@clipforge/core/db';
import { config } from '@clipforge/core/config';
import { storage, localStorageDriver, type MultipartRef } from '@clipforge/core/storage';

/** Periodic cleanup: expired sessions, expired ZIPs, abandoned uploads, stale temp files. */
export async function runMaintenance() {
  const summary: Record<string, number> = {};
  try {
    summary.sessions = (await query('delete from sessions where expires_at < now() returning id')).length;

    const exps = await query<{ id: string; storage_key: string | null }>(`select id, storage_key from exports where (expires_at < now()) or (status = 'failed' and updated_at < now() - interval '1 day')`);
    for (const e of exps) {
      if (e.storage_key) await storage().delete(e.storage_key).catch(() => {});
      await query('delete from exports where id = $1', [e.id]);
    }
    summary.exports = exps.length;

    // Uploads that never completed within 24 hours.
    const stale = await query<{ id: string; storage_key: string; driver_upload_id: string | null; video_id: string }>(
      `select id, storage_key, driver_upload_id, video_id from uploads where status = 'active' and updated_at < now() - interval '24 hours'`,
    );
    for (const u of stale) {
      const ref: MultipartRef = { uploadId: u.id, storageKey: u.storage_key, driverUploadId: u.driver_upload_id };
      await storage().abortMultipart(ref).catch(() => {});
      await query(`update uploads set status = 'aborted', updated_at = now() where id = $1`, [u.id]);
      await query(`update videos set status = 'failed', error = 'The upload was not finished within 24 hours.', updated_at = now() where id = $1 and status = 'uploading'`, [u.video_id]);
    }
    summary.uploads = stale.length;
    if (storage().name === 'local') summary.partDirs = await localStorageDriver().cleanupStaleParts(26 * 3600_000);

    // Temp work dirs older than 12 hours (left behind by a crash).
    let removed = 0;
    for (const d of await fsp.readdir(config.tmpDir).catch(() => [] as string[])) {
      const p = path.join(config.tmpDir, d);
      const st = await fsp.stat(p).catch(() => null);
      if (st && Date.now() - st.mtimeMs > 12 * 3600_000) { await fsp.rm(p, { recursive: true, force: true }); removed++; }
    }
    summary.tmp = removed;

    await query(`delete from system_errors where created_at < now() - interval '90 days'`);
  } catch (e) {
    await logError('worker', 'maintenance', e);
  }
  return summary;
}
