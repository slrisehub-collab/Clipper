// Server-side configuration from environment variables. Never import from client code.
import fs from 'node:fs';
import path from 'node:path';

/** Monorepo root (the folder whose package.json declares workspaces), so relative paths
 *  in .env mean the same thing to the web app and the worker. */
function projectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.workspaces) return dir;
    } catch { /* keep walking */ }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}
const resolveDir = (p: string) => (path.isAbsolute(p) ? p : path.resolve(projectRoot(), p));

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const config = {
  get databaseUrl() { return req('DATABASE_URL'); },
  get redisUrl() { return req('REDIS_URL', 'redis://127.0.0.1:6379'); },
  get appUrl() { return req('APP_URL', 'http://localhost:3000').replace(/\/$/, ''); },
  /** HMAC secret for signed file URLs and upload part tokens. */
  get signingSecret() {
    const s = req('SIGNING_SECRET');
    if (s.length < 32) throw new Error('SIGNING_SECRET must be at least 32 characters');
    return s;
  },
  get storageDriver(): 'local' | 's3' { return (process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local'); },
  get storageDir() { return resolveDir(req('STORAGE_DIR', './data/storage')); },
  get tmpDir() { return resolveDir(req('WORK_DIR', './data/tmp')); },
  s3: {
    get endpoint() { return process.env.S3_ENDPOINT || undefined; },
    get region() { return process.env.S3_REGION || 'auto'; },
    get bucket() { return req('S3_BUCKET'); },
    get accessKeyId() { return req('S3_ACCESS_KEY_ID'); },
    get secretAccessKey() { return req('S3_SECRET_ACCESS_KEY'); },
    get forcePathStyle() { return process.env.S3_FORCE_PATH_STYLE === 'true'; },
  },
  get workerConcurrency() { return Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 1)); },
  get ffmpegPath() { return process.env.FFMPEG_PATH || 'ffmpeg'; },
  get ffprobePath() { return process.env.FFPROBE_PATH || 'ffprobe'; },
  get ffmpegThreads() { return Number(process.env.FFMPEG_THREADS ?? 0); },
  get allowRegistration() { return process.env.ALLOW_REGISTRATION !== 'false'; },
  get secureCookies() { return (process.env.APP_URL ?? '').startsWith('https://'); },
  /** Only for local testing of URL import against a local server. Never enable in production. */
  get allowPrivateUrls() { return process.env.UNSAFE_ALLOW_PRIVATE_URLS === 'true'; },
};
