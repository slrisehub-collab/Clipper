import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';
import { verify } from '@clipforge/core/signing';
import { localStorageDriver } from '@clipforge/core/storage';

export const runtime = 'nodejs';

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg', '.zip': 'application/zip', '.avi': 'video/x-msvideo', '.ts': 'video/mp2t', '.3gp': 'video/3gpp', '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg',
};

const deny = (status: number, msg: string) => new Response(msg, { status, headers: { 'content-type': 'text/plain' } });

/**
 * Serves files for the local storage driver. Access requires an HMAC signature over
 * (key, expiry, download name) that the app only issues after an ownership check.
 * Supports HTTP Range so video players can seek.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const key = sp.get('k') ?? '';
  const exp = Number(sp.get('e'));
  const sig = sp.get('s') ?? '';
  const name = sp.get('d') ?? '';
  if (!key || !exp || !sig) return deny(400, 'Bad request');
  if (exp < Date.now() / 1000) return deny(410, 'This link has expired. Reload the page to get a fresh one.');
  if (!verify(['file', key, exp, name], sig)) return deny(403, 'Invalid link');

  let file: string;
  try { file = localStorageDriver().absolutePath(key); } catch { return deny(400, 'Bad request'); }
  const st = await fsp.stat(file).catch(() => null);
  if (!st || !st.isFile()) return deny(404, 'Not found');

  const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const headers = new Headers({
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
  });
  if (name) headers.set('content-disposition', `attachment; filename="${name.replace(/[^\w.\- ]/g, '_')}"`);

  const range = req.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, st.size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${st.size}` } });
    headers.set('content-range', `bytes ${start}-${end}/${st.size}`);
    headers.set('content-length', String(end - start + 1));
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers.set('content-length', String(st.size));
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { status: 200, headers });
}
