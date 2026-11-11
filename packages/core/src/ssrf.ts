// Server-side request forgery protection for URL imports.
// Every connection is checked at connect time (via a custom DNS lookup on the undici Agent),
// so DNS rebinding cannot swap a public address for a private one after validation.
import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch, type Response } from 'undici';
import { config } from './config';

export class UrlRejected extends Error {}

const BLOCKED_HOSTNAMES = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i, /^metadata\.google\.internal$/i];

/** Platforms whose pages are not direct media files. Downloading them would mean scraping
 *  around their terms and access controls, which ClipForge does not do. */
const UNSUPPORTED_PLATFORMS: [RegExp, string][] = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, 'YouTube'],
  [/(^|\.)tiktok\.com$/i, 'TikTok'],
  [/(^|\.)instagram\.com$/i, 'Instagram'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.watch$/i, 'Facebook'],
  [/(^|\.)twitter\.com$|(^|\.)x\.com$/i, 'X (Twitter)'],
  [/(^|\.)vimeo\.com$/i, 'Vimeo'],
  [/(^|\.)netflix\.com$|(^|\.)primevideo\.com$|(^|\.)disneyplus\.com$/i, 'a streaming service'],
  [/(^|\.)twitch\.tv$/i, 'Twitch'],
  [/(^|\.)dailymotion\.com$/i, 'Dailymotion'],
];

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||  // CGNAT
      (a === 169 && b === 254) ||            // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224                               // multicast + reserved
    );
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2001:db8');
  }
  return true;
}

export function checkUrlShape(raw: string): URL {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new UrlRejected('That does not look like a valid link. Check it starts with https://'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new UrlRejected('Only http and https links are supported.');
  if (u.username || u.password) throw new UrlRejected('Links with embedded usernames or passwords are not accepted.');
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port) && !config.allowPrivateUrls) throw new UrlRejected('Links on unusual ports are not accepted.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  for (const [re, name] of UNSUPPORTED_PLATFORMS) {
    if (re.test(host)) {
      throw new UrlRejected(`${name} links can't be imported. ClipForge only downloads direct video file links, and doesn't bypass platform restrictions. If you own the video, download it from ${name} and upload the file here.`);
    }
  }
  if (!config.allowPrivateUrls) {
    if (BLOCKED_HOSTNAMES.some((re) => re.test(host))) throw new UrlRejected('Links to local or internal addresses are not allowed.');
    if (net.isIP(host) && isPrivateIp(host)) throw new UrlRejected('Links to private network addresses are not allowed.');
  }
  return u;
}

function safeLookup(hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, undefined as any);
    const list = (addresses as dns.LookupAddress[]);
    if (!config.allowPrivateUrls) {
      const bad = list.find((a) => isPrivateIp(a.address));
      if (bad || !list.length) {
        const e = new Error('Blocked private address') as NodeJS.ErrnoException;
        e.code = 'EBLOCKED';
        return cb(e, undefined as any);
      }
    }
    if ((options as any).all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

const agent = new Agent({ connect: { lookup: safeLookup as any, timeout: 15_000 }, headersTimeout: 30_000, bodyTimeout: 60_000 });

const UA = 'ClipForge/1.0 (+video import)';

/** fetch with redirect re-validation and private-address blocking. */
export async function safeFetch(raw: string, init: { method?: 'GET' | 'HEAD'; signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<{ res: Response; finalUrl: URL }> {
  let url = checkUrlShape(raw);
  for (let hop = 0; hop < 5; hop++) {
    let res: Response;
    try {
      res = await fetch(url, { method: init.method ?? 'GET', redirect: 'manual', dispatcher: agent, signal: init.signal, headers: { 'user-agent': UA, ...init.headers } });
    } catch (e: any) {
      const code = e?.cause?.code ?? e?.code;
      if (code === 'EBLOCKED') throw new UrlRejected('That link points to a private or internal address, which is not allowed.');
      if (code === 'ENOTFOUND') throw new UrlRejected('That website could not be found. Check the link.');
      throw new UrlRejected(`Could not reach that link (${code ?? e?.message ?? 'network error'}).`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel().catch(() => {});
      url = checkUrlShape(new URL(res.headers.get('location')!, url).toString());
      continue;
    }
    return { res, finalUrl: url };
  }
  throw new UrlRejected('Too many redirects.');
}

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|ts|3gp)$/i;

export interface RemoteInfo { url: string; contentType: string | null; size: number | null; fileName: string }

/** Lightweight check before queueing an import: is this a reachable, direct video file? */
export async function inspectRemoteVideo(raw: string): Promise<RemoteInfo> {
  let { res, finalUrl } = await safeFetch(raw, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
  if (res.status === 405 || res.status === 403 || res.status === 501) {
    // Some servers reject HEAD; ask for one byte instead.
    ({ res, finalUrl } = await safeFetch(raw, { method: 'GET', signal: AbortSignal.timeout(15_000), headers: { range: 'bytes=0-0' } }));
    await res.body?.cancel().catch(() => {});
  }
  if (res.status === 401 || res.status === 403) throw new UrlRejected('That link needs a login or is private. ClipForge only imports publicly accessible files you are allowed to use.');
  if (res.status === 404) throw new UrlRejected('Nothing was found at that link (404).');
  if (res.status >= 400) throw new UrlRejected(`The server returned an error (${res.status}).`);
  const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() || null;
  const range = res.headers.get('content-range')?.match(/\/(\d+)$/);
  const size = range ? Number(range[1]) : res.headers.get('content-length') ? Number(res.headers.get('content-length')) : null;
  const isVideo = (ct && (ct.startsWith('video/') || ct === 'application/octet-stream' || ct === 'application/x-matroska')) || VIDEO_EXT.test(finalUrl.pathname);
  if (ct === 'text/html' || !isVideo) {
    throw new UrlRejected('That link opens a web page, not a video file. Paste a direct link to a video file (for example ending in .mp4), or upload the file instead.');
  }
  if (ct === 'application/vnd.apple.mpegurl' || ct === 'application/x-mpegurl' || ct === 'application/dash+xml') {
    throw new UrlRejected('Streaming playlists (HLS/DASH) are not supported. Use a direct video file link or upload the file.');
  }
  const cd = res.headers.get('content-disposition')?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const fileName = decodeURIComponent(cd?.[1] ?? finalUrl.pathname.split('/').pop() ?? 'video') || 'video';
  return { url: finalUrl.toString(), contentType: ct, size, fileName };
}
