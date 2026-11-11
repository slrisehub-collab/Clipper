// End-to-end acceptance tests against the real stack: Next.js production server,
// FFmpeg worker, PostgreSQL, Redis and local storage. Run after `npm run build`:
//   npm run test:acceptance
// Requires ffmpeg/ffprobe on PATH and DATABASE_URL / REDIS_URL in .env.
import 'dotenv/config';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'test-output');
const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;
const results: { name: string; ok: boolean; detail: string }[] = [];
const procs: ChildProcess[] = [];

function log(...a: unknown[]) { console.log('  ', ...a); }

async function check(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const detail = (await fn()) ?? '';
    results.push({ name, ok: true, detail });
    console.log(`PASS  ${name}  (${((Date.now() - t0) / 1000).toFixed(1)}s) ${detail}`);
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message });
    console.log(`FAIL  ${name}: ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }

// ------------------------------------------------------------------ HTTP client with cookies

class Client {
  cookie = '';
  constructor(public label: string) {}
  async req(method: string, p: string, body?: unknown, raw?: Buffer): Promise<{ status: number; data: any; headers: Headers }> {
    const res = await fetch(p.startsWith('http') ? p : BASE + p, {
      method,
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
      redirect: 'manual',
    });
    const sc = res.headers.getSetCookie?.() ?? [];
    for (const c of sc) if (c.startsWith('cf_session=')) this.cookie = c.split(';')[0];
    let data: any = null;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('json')) data = await res.json(); else await res.arrayBuffer();
    return { status: res.status, data, headers: res.headers };
  }
  get(p: string) { return this.req('GET', p); }
  post(p: string, b: unknown = {}) { return this.req('POST', p, b); }
}

async function download(url: string, dest: string) {
  const res = await fetch(url.startsWith('http') ? url : BASE + url);
  assert(res.ok, `download ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return res;
}

function probe(file: string) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString();
  const j = JSON.parse(out);
  const v = j.streams.find((s: any) => s.codec_type === 'video');
  const a = j.streams.find((s: any) => s.codec_type === 'audio');
  return { duration: Number(j.format.duration), v, a, vdur: Number(v?.duration ?? j.format.duration), adur: a ? Number(a.duration ?? j.format.duration) : null };
}

// ------------------------------------------------------------------ app helpers

async function uploadFile(c: Client, file: string, opts: { stopAfterParts?: number } = {}) {
  const size = fs.statSync(file).size;
  const init = await c.post('/api/uploads', { fileName: path.basename(file), size, mimeType: 'video/mp4' });
  assert(init.status === 201, `init upload ${init.status} ${JSON.stringify(init.data)}`);
  const { uploadId, partSize, partCount, videoId, projectId } = init.data;
  const fd = fs.openSync(file, 'r');
  const sendPart = async (n: number) => {
    const signed = await c.post(`/api/uploads/${uploadId}/sign`, { parts: [n] });
    assert(signed.status === 200, `sign ${signed.status}`);
    const len = Math.min(partSize, size - (n - 1) * partSize);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, (n - 1) * partSize);
    const r = await c.req('PUT', signed.data.urls[n], undefined, buf);
    assert(r.status === 200, `part ${n}: ${r.status} ${JSON.stringify(r.data)}`);
  };
  const limit = opts.stopAfterParts ?? partCount;
  for (let n = 1; n <= Math.min(limit, partCount); n++) await sendPart(n);
  return {
    uploadId, videoId, projectId, partCount,
    async resume() {
      const st = await c.get(`/api/uploads/${uploadId}`);
      const have = new Set(st.data.parts.map((p: any) => p.partNumber));
      for (let n = 1; n <= partCount; n++) if (!have.has(n)) await sendPart(n);
      return have.size;
    },
    async complete() {
      fs.closeSync(fd);
      return c.post(`/api/uploads/${uploadId}/complete`, {});
    },
  };
}

async function waitVideo(c: Client, id: string, timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await c.get(`/api/videos/${id}`);
    if (r.data?.video?.status === 'ready' || r.data?.video?.status === 'failed') return r.data.video;
    await sleep(500);
  }
  throw new Error('video did not become ready');
}

async function waitJob(c: Client, id: string, until = ['completed', 'failed', 'canceled'], timeoutMs = 600_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await c.get(`/api/jobs/${id}`);
    if (until.includes(r.data.job.status)) return r.data.job;
    await sleep(500);
  }
  throw new Error(`job ${id} timed out`);
}

const cfg = (o: Record<string, unknown>) => ({ format: 'mp4', quality: 'original', aspect: 'original', aspectMode: 'crop', keepAudio: true, cutMode: 'precise', ...o });

async function runJob(c: Client, videoId: string, config: Record<string, unknown>) {
  const r = await c.post('/api/jobs', { videoId, config, idempotencyKey: `test-${Date.now()}-${Math.random()}` });
  assert(r.status === 201, `create job ${r.status} ${JSON.stringify(r.data)}`);
  const job = await waitJob(c, r.data.job.id);
  assert(job.status === 'completed', `job ${job.status}: ${job.error}`);
  return job;
}

async function jobClips(c: Client, projectId: string, jobId: string) {
  const r = await c.get(`/api/projects/${projectId}`);
  return (r.data.clips as any[]).filter((x) => x.jobId === jobId).sort((a, b) => a.idx - b.idx);
}

/** Download every clip and check duration, playability and A/V sync. */
async function verifyClips(clips: any[], expected: number[], dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  assert(clips.length === expected.length, `expected ${expected.length} clips, got ${clips.length}`);
  let maxDrift = 0;
  let maxErr = 0;
  for (let i = 0; i < clips.length; i++) {
    const f = path.join(dir, clips[i].fileName);
    await download(clips[i].downloadUrl, f);
    const p = probe(f);
    assert(p.v, `clip ${i + 1} has no video`);
    assert(p.a, `clip ${i + 1} has no audio`);
    const err = Math.abs(p.duration - expected[i]);
    maxErr = Math.max(maxErr, err);
    assert(err < 0.3, `clip ${i + 1} is ${p.duration.toFixed(3)}s, expected ${expected[i]}s`);
    if (p.adur !== null) maxDrift = Math.max(maxDrift, Math.abs(p.vdur - p.adur));
    // Decode the whole clip to prove it is independently playable.
    execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', f, '-f', 'null', '-']);
  }
  assert(maxDrift < 0.1, `audio/video drift ${maxDrift.toFixed(3)}s`);
  return `max duration error ${maxErr.toFixed(3)}s, max A/V drift ${maxDrift.toFixed(3)}s, methods: ${[...new Set(clips.map((c) => c.method))].join('+')}`;
}

// ------------------------------------------------------------------ process management

function start(name: string, cmd: string, args: string[], env: Record<string, string>, cwd: string) {
  const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const logf = fs.createWriteStream(path.join(OUT, `${name}.log`), { flags: 'a' });
  p.stdout.pipe(logf); p.stderr.pipe(logf);
  procs.push(p);
  return p;
}

async function startStack(extraEnv: Record<string, string> = {}) {
  try { await fetch(BASE + '/login'); throw new Error(`port ${PORT} is already in use; stop the other server first`); } catch (e) { if ((e as Error).message.includes('already in use')) throw e; }
  const env = { APP_URL: BASE, PORT: String(PORT), ...extraEnv };
  start('web', 'npx', ['next', 'start', '-p', String(PORT), '-H', '127.0.0.1'], env, path.join(ROOT, 'apps/web'));
  start('worker', 'npx', ['tsx', 'src/index.ts'], env, path.join(ROOT, 'apps/worker'));
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + '/login'); if (r.ok) break; } catch { /* starting */ }
    await sleep(500);
  }
  await sleep(1500); // let the worker connect
}

async function stopStack() {
  // Kill whole process groups: npx spawns next/tsx as children.
  for (const p of procs.splice(0)) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* already gone */ } }
  for (let i = 0; i < 40; i++) {
    try { await fetch(BASE + '/login'); } catch { break; }
    await sleep(250);
  }
  await sleep(500);
}

// ------------------------------------------------------------------ main

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const src = path.join(OUT, 'ten-minutes.mp4');
  console.log('Generating a 10-minute test video (640x360, 25 fps, H.264 + AAC, keyframe every 2 s)…');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '600', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '50', '-keyint_min', '50', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-shortest', src]);
  const notVideo = path.join(OUT, 'not-a-video.mp4');
  fs.writeFileSync(notVideo, Buffer.alloc(200_000, 7));
  log(`source: ${(fs.statSync(src).size / 1e6).toFixed(1)} MB`);

  await startStack();
  const A = new Client('A');
  const B = new Client('B');
  const stamp = Date.now();

  let videoId = '', projectId = '';
  let job60: any;
  let clip1: any;

  await check('Register and sign in two users', async () => {
    assert((await A.post('/api/auth/register', { email: `a${stamp}@test.local`, password: 'password-a-123' })).status === 201, 'register A');
    assert((await B.post('/api/auth/register', { email: `b${stamp}@test.local`, password: 'password-b-123' })).status === 201, 'register B');
    const bad = await new Client('x').post('/api/auth/login', { email: `a${stamp}@test.local`, password: 'wrong' });
    assert(bad.status === 401, `wrong password should be 401, got ${bad.status}`);
  });

  await check('TEST 8a: interrupted upload resumes from the parts already received', async () => {
    const up = await uploadFile(A, src, { stopAfterParts: 1 });
    assert(up.partCount > 1, `need a multi-part upload for this test (file split into ${up.partCount} parts)`);
    const early = await A.post(`/api/uploads/${up.uploadId}/complete`, {});
    assert(early.status === 409, `completing an unfinished upload should be refused, got ${early.status}`);
    const st = await A.get(`/api/uploads/${up.uploadId}`);
    assert(st.data.parts.length === 1, `server should report 1 part received, got ${st.data.parts.length}`);
    const reup = await uploadFileResume(A, src, up.uploadId);
    const done = await A.post(`/api/uploads/${up.uploadId}/complete`, {});
    assert(done.status === 200, `complete ${done.status} ${JSON.stringify(done.data)}`);
    videoId = up.videoId; projectId = up.projectId;
    const v = await waitVideo(A, videoId);
    assert(v.status === 'ready', `video ${v.status}: ${v.error}`);
    assert(Math.abs(v.duration - 600) < 0.2, `duration ${v.duration}`);
    return `${up.partCount} parts, resumed after part 1 (${reup} sent on resume); probed ${v.duration.toFixed(2)}s ${v.width}x${v.height}`;
  });

  await check('TEST 1: 10-minute video in 60-second clips gives 10 playable clips', async () => {
    job60 = await runJob(A, videoId, cfg({ method: 'duration', segmentSeconds: 60 }));
    const clips = await jobClips(A, projectId, job60.id);
    clip1 = clips[0];
    return verifyClips(clips, Array(10).fill(60), path.join(OUT, 'test1'));
  });

  await check('TEST 2: 30-second clips gives 20 playable clips', async () => {
    const j = await runJob(A, videoId, cfg({ method: 'duration', segmentSeconds: 30 }));
    return verifyClips(await jobClips(A, projectId, j.id), Array(20).fill(30), path.join(OUT, 'test2'));
  });

  await check('TEST 3: 45-second clips gives 14 clips, the last holding the remaining 15 s', async () => {
    const j = await runJob(A, videoId, cfg({ method: 'duration', segmentSeconds: 45 }));
    const clips = await jobClips(A, projectId, j.id);
    const d = await verifyClips(clips, [...Array(13).fill(45), 15], path.join(OUT, 'test3'));
    assert(clips[13].start === 585 && clips[13].end === 600, 'last clip should span 09:45 to 10:00');
    return d;
  });

  await check('TEST 4: custom start/end times (00:00-01:30, 05:00-06:15, 07:30-09:00)', async () => {
    const j = await runJob(A, videoId, cfg({ method: 'custom', ranges: [{ start: 0, end: 90 }, { start: 300, end: 375 }, { start: 450, end: 540 }] }));
    return verifyClips(await jobClips(A, projectId, j.id), [90, 75, 90], path.join(OUT, 'test4'));
  });

  await check('Number-of-clips method: 7 equal clips', async () => {
    const j = await runJob(A, videoId, cfg({ method: 'count', count: 7 }));
    return verifyClips(await jobClips(A, projectId, j.id), Array(7).fill(600 / 7), path.join(OUT, 'count'));
  });

  await check('Re-encode path: 9:16 crop, 480p cap, WebM, audio removed', async () => {
    const j = await runJob(A, videoId, cfg({ method: 'custom', ranges: [{ start: 12.3, end: 22.3 }], format: 'webm', aspect: '9:16', aspectMode: 'crop', keepAudio: false }));
    const [c] = await jobClips(A, projectId, j.id);
    const f = path.join(OUT, 'reencode.webm');
    await download(c.downloadUrl, f);
    const p = probe(f);
    assert(p.v.codec_name === 'vp9', `codec ${p.v.codec_name}`);
    assert(!p.a, 'audio should be removed');
    assert(p.v.width === 360 && p.v.height === 640, `size ${p.v.width}x${p.v.height}`);
    assert(Math.abs(p.duration - 10) < 0.15, `duration ${p.duration}`);
    return `${p.v.width}x${p.v.height} VP9, ${p.duration.toFixed(2)}s, no audio`;
  });

  await check('Fast mode cuts on keyframes with stream copy', async () => {
    const j = await runJob(A, videoId, cfg({ method: 'duration', segmentSeconds: 45, cutMode: 'fast' }));
    const clips = await jobClips(A, projectId, j.id);
    assert(clips.every((c) => c.method === 'copy'), 'every clip should be a stream copy');
    assert(clips.every((c) => Math.round(c.start * 1000) % 2000 === 0), 'starts should be on 2 s keyframes');
    return `${clips.length} clips, starts ${clips.slice(0, 4).map((c) => c.start).join(', ')}…`;
  });

  await check('TEST 5: download an individual clip (signed URL and redirect endpoint)', async () => {
    const f = path.join(OUT, 'single.mp4');
    const res = await download(clip1.downloadUrl, f);
    assert(/attachment/.test(res.headers.get('content-disposition') ?? ''), 'should download as attachment');
    const r = await A.get(`/api/clips/${clip1.id}/download`);
    assert(r.status === 302, `redirect endpoint ${r.status}`);
    const range = await fetch(BASE + clip1.playUrl, { headers: { range: 'bytes=0-99' } });
    assert(range.status === 206 && (await range.arrayBuffer()).byteLength === 100, 'range requests should work for seeking');
    return `${(fs.statSync(f).size / 1e6).toFixed(2)} MB, ${probe(f).duration.toFixed(2)}s`;
  });

  await check('TEST 6: download all clips as a ZIP', async () => {
    const r = await A.post('/api/exports', { projectId, jobId: job60.id });
    assert(r.status === 201, `export ${r.status} ${JSON.stringify(r.data)}`);
    let e: any;
    for (let i = 0; i < 120; i++) { e = (await A.get(`/api/exports/${r.data.exportId}`)).data; if (e.status === 'completed' || e.status === 'failed') break; await sleep(500); }
    assert(e.status === 'completed', `export ${e.status} ${e.error}`);
    const z = path.join(OUT, 'all.zip');
    await download(e.url, z);
    const list = execFileSync('unzip', ['-Z1', z]).toString().trim().split('\n');
    assert(list.length === 10, `zip has ${list.length} entries`);
    execFileSync('unzip', ['-q', '-o', z, '-d', path.join(OUT, 'unzipped')]);
    const d = probe(path.join(OUT, 'unzipped', list[0])).duration;
    assert(Math.abs(d - 60) < 0.3, 'zipped clip plays');
    return `${list.length} files, ${(fs.statSync(z).size / 1e6).toFixed(1)} MB`;
  });

  await check('Selected clips ZIP', async () => {
    const clips = await jobClips(A, projectId, job60.id);
    const r = await A.post('/api/exports', { projectId, clipIds: [clips[1].id, clips[4].id] });
    let e: any;
    for (let i = 0; i < 60; i++) { e = (await A.get(`/api/exports/${r.data.exportId}`)).data; if (e.status === 'completed') break; await sleep(500); }
    assert(e.clipCount === 2 && e.status === 'completed', 'selected export');
  });

  await check('TEST 8b: cancel during processing, then retry resumes and finishes', async () => {
    const r = await A.post('/api/jobs', { videoId, config: cfg({ method: 'duration', segmentSeconds: 20, format: 'webm' }), idempotencyKey: `cancel-${stamp}` });
    const id = r.data.job.id;
    for (let i = 0; i < 240; i++) { const j = (await A.get(`/api/jobs/${id}`)).data.job; if (j.completedClips >= 2) break; await sleep(250); }
    const c = await A.post(`/api/jobs/${id}/cancel`);
    assert(c.status === 200, `cancel ${c.status}`);
    const cancelled = await waitJob(A, id, ['canceled', 'completed', 'failed'], 60_000);
    assert(cancelled.status === 'canceled', `status after cancel: ${cancelled.status}`);
    const kept = cancelled.completedClips;
    assert(kept > 0 && kept < 30, `kept ${kept} clips`);
    const rt = await A.post(`/api/jobs/${id}/retry`);
    assert(rt.status === 200, `retry ${rt.status}`);
    const done = await waitJob(A, id);
    assert(done.status === 'completed' && done.completedClips === 30, `after retry: ${done.status} ${done.completedClips}/30`);
    return `cancelled with ${kept}/30 done, retry completed all 30`;
  });

  await check('TEST 8c: a corrupt upload fails with a clear message', async () => {
    const up = await uploadFile(A, notVideo);
    assert((await up.complete()).status === 200, 'complete');
    const v = await waitVideo(A, up.videoId);
    assert(v.status === 'failed', `status ${v.status}`);
    assert(/could not be read|No video track/i.test(v.error), `message: ${v.error}`);
    return `"${v.error}"`;
  });

  await check('Repeated clicks do not create duplicate jobs', async () => {
    const body = { videoId, config: cfg({ method: 'duration', segmentSeconds: 300 }), idempotencyKey: `dup-${stamp}` };
    const [r1, r2, r3] = await Promise.all([A.post('/api/jobs', body), A.post('/api/jobs', body), A.post('/api/jobs', body)]);
    const ids = new Set([r1, r2, r3].map((r) => r.data.job.id));
    assert(ids.size === 1, `got ${ids.size} distinct jobs`);
    await waitJob(A, [...ids][0]);
  });

  await check('Validation: bad file type, impossible quality, oversize clip count', async () => {
    const t = await A.post('/api/uploads', { fileName: 'virus.exe', size: 1000 });
    assert(t.status === 400, `exe upload ${t.status}`);
    const q = await A.post('/api/jobs', { videoId, config: cfg({ method: 'duration', segmentSeconds: 60, quality: '1080' }), idempotencyKey: `q-${stamp}` });
    assert(q.status === 400 && /upscaling/.test(q.data.error), `1080 from 360p: ${q.status}`);
    const n = await A.post('/api/jobs', { videoId, config: cfg({ method: 'duration', segmentSeconds: 1 }), idempotencyKey: `n-${stamp}` });
    assert(n.status === 400 && /allows up to/.test(n.data.error), `600 clips on free plan: ${n.status}`);
  });

  await check('SSRF: links to private addresses and platform pages are refused', async () => {
    for (const u of ['http://127.0.0.1:5432/x.mp4', 'http://169.254.169.254/latest/meta-data/', 'http://localhost/x.mp4', 'https://www.youtube.com/watch?v=abc', 'file:///etc/passwd']) {
      const r = await A.post('/api/imports', { url: u });
      assert(r.status === 422 || r.status === 400, `${u} gave ${r.status}`);
    }
  });

  await check("TEST 9: one user cannot reach another user's videos or clips", async () => {
    const tries: [string, () => Promise<{ status: number }>][] = [
      ['project', () => B.get(`/api/projects/${projectId}`)],
      ['video', () => B.get(`/api/videos/${videoId}`)],
      ['job', () => B.get(`/api/jobs/${job60.id}`)],
      ['cancel job', () => B.post(`/api/jobs/${job60.id}/cancel`)],
      ['clip download', () => B.get(`/api/clips/${clip1.id}/download`)],
      ['delete clip', () => B.req('DELETE', `/api/clips/${clip1.id}`)],
      ['rename project', () => B.req('PATCH', `/api/projects/${projectId}`, { name: 'pwned' })],
      ['delete project', () => B.req('DELETE', `/api/projects/${projectId}`)],
      ['zip export', () => B.post('/api/exports', { projectId, clipIds: [clip1.id] })],
      ['share clip', () => B.post(`/api/clips/${clip1.id}/share`, { enabled: true })],
      ['new job on video', () => B.post('/api/jobs', { videoId, config: cfg({ method: 'duration', segmentSeconds: 60 }), idempotencyKey: `x-${stamp}` })],
    ];
    for (const [name, fn] of tries) {
      const r = await fn();
      assert(r.status === 404, `${name}: expected 404, got ${r.status}`);
    }
    const anon = await new Client('anon').get(`/api/projects/${projectId}`);
    assert(anon.status === 401, `anonymous ${anon.status}`);
    // Tampering with a signed file URL: change the key, keep the signature.
    const u = new URL(BASE + clip1.playUrl);
    u.searchParams.set('k', u.searchParams.get('k')!.replace(/clip-0001/, 'clip-0002'));
    assert((await fetch(u)).status === 403, 'tampered signed URL must be rejected');
    const exp = new URL(BASE + clip1.playUrl);
    exp.searchParams.set('e', '1000');
    assert((await fetch(exp)).status === 410 || (await fetch(exp)).status === 403, 'expired URL must be rejected');
    // B's own listing shows nothing of A's.
    const list = await B.get('/api/projects');
    assert(list.data.projects.length === 0, 'B should see no projects');
    // A still has everything.
    assert((await A.get(`/api/projects/${projectId}`)).status === 200, 'A still has access');
    return `${tries.length} cross-account requests refused, signed URL tampering refused`;
  });

  await check('Rename and delete a project removes its files', async () => {
    const up = await uploadFile(A, src);
    await up.complete();
    await waitVideo(A, up.videoId);
    const j = await runJob(A, up.videoId, cfg({ method: 'duration', segmentSeconds: 300 }));
    void j;
    assert((await A.req('PATCH', `/api/projects/${up.projectId}`, { name: 'Renamed' })).status === 200, 'rename');
    const before = (await A.get(`/api/projects/${up.projectId}`)).data;
    assert(before.project.name === 'Renamed', 'name updated');
    const clipUrl = before.clips[0].playUrl;
    assert((await A.req('DELETE', `/api/projects/${up.projectId}`)).status === 200, 'delete');
    assert((await A.get(`/api/projects/${up.projectId}`)).status === 404, 'gone');
    assert((await fetch(BASE + clipUrl)).status === 404, 'file removed from storage');
  });

  await stopStack();

  // Phase 2: URL import. The stack refuses private addresses by default, so this phase
  // turns that off to import from a throwaway local web server.
  const server = http.createServer((req, res) => {
    if (req.url === '/video.mp4') {
      const st = fs.statSync(src);
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': st.size });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(src).pipe(res);
    } else if (req.url === '/page') {
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html></html>');
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((r) => server.listen(3999, '127.0.0.1', r));
  await startStack({ UNSAFE_ALLOW_PRIVATE_URLS: 'true' });
  await A.post('/api/auth/login', { email: `a${stamp}@test.local`, password: 'password-a-123' });

  await check('URL import: direct video link is downloaded, probed and clipped', async () => {
    const page = await A.post('/api/imports', { url: 'http://127.0.0.1:3999/page' });
    assert(page.status === 422 && /web page, not a video/.test(page.data.error), `html page: ${page.status} ${page.data?.error}`);
    const r = await A.post('/api/imports', { url: 'http://127.0.0.1:3999/video.mp4' });
    assert(r.status === 201, `import ${r.status} ${JSON.stringify(r.data)}`);
    const v = await waitVideo(A, r.data.videoId);
    assert(v.status === 'ready' && Math.abs(v.duration - 600) < 0.2, `imported ${v.status} ${v.error}`);
    const j = await runJob(A, v.id, cfg({ method: 'interval', segmentSeconds: 120 }));
    return verifyClips(await jobClips(A, r.data.projectId, j.id), Array(5).fill(120), path.join(OUT, 'url'));
  });

  await stopStack();
  server.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} acceptance checks passed.`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}

/** Resume an upload by id: ask the server which parts it has and send the rest. */
async function uploadFileResume(c: Client, file: string, uploadId: string) {
  const size = fs.statSync(file).size;
  const st = await c.get(`/api/uploads/${uploadId}`);
  const { partSize, partCount } = st.data;
  const have = new Set(st.data.parts.map((p: any) => p.partNumber));
  const fd = fs.openSync(file, 'r');
  let sent = 0;
  for (let n = 1; n <= partCount; n++) {
    if (have.has(n)) continue;
    const signed = await c.post(`/api/uploads/${uploadId}/sign`, { parts: [n] });
    const len = Math.min(partSize, size - (n - 1) * partSize);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, (n - 1) * partSize);
    const r = await c.req('PUT', signed.data.urls[n], undefined, buf);
    assert(r.status === 200, `resume part ${n}: ${r.status}`);
    sent++;
  }
  fs.closeSync(fd);
  return sent;
}

main().catch(async (e) => { console.error(e); await stopStack(); process.exit(1); });
