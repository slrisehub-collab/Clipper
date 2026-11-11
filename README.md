# ClipForge

ClipForge splits long videos into separate, downloadable clips. Upload a file or paste a direct video link, pick how to divide it, press one button, and the server cuts the clips with FFmpeg.

Everything in the stack is free and open source. There is no Supabase, Firebase or other paid backend: the app runs on PostgreSQL, Redis and FFmpeg, with storage on local disk or any S3-compatible bucket.

## What it does

- **Two ways in.** Drag-and-drop or browse upload (resumable, chunked, with progress and cancel), or paste a direct link to a video file.
- **Four ways to split.** Equal duration (presets from 5 s to 10 min, or custom seconds/minutes), custom start and end times, a fixed number of clips, or regular intervals.
- **A preview before you commit.** Source thumbnail, title, duration, resolution, size, the expected clip count, and a timeline showing every cut.
- **Real processing.** A separate worker runs FFmpeg. Clips are stream-copied when no re-encode is needed and the cut lands on a keyframe; otherwise they are re-encoded for frame-accurate cuts. A "Fast" mode copies everything and snaps cuts to keyframes.
- **Output settings.** MP4 (H.264/AAC) or WebM (VP9/Opus); original, 1080p, 720p or 480p (only options that don't upscale are offered); original, 16:9, 9:16 or 1:1 with crop-to-fill or fit-with-bars; keep or remove audio.
- **Live progress.** Status, percentage, clips done, current clip, estimated time left, cancel and retry. Jobs run in the background; closing the browser doesn't stop them. Retries skip clips that were already made.
- **Clips gallery.** Thumbnails, clip number, start/end, duration, preview player, individual download, star to save, share link (revocable), delete, multi-select, and ZIP of all or selected clips built on the server.
- **Dashboard.** Recent projects, uploads, in-progress jobs, saved clips, storage and processing usage, project rename/delete, processing history, account settings.
- **Admin panel.** Users (suspend, change plan, promote), jobs across all users (with cancel), queue depth, storage totals, error log, processing performance, and editable plan limits.
- **Plans.** Free and Pro limits (video length, monthly processing minutes, storage, upload size, clips per job, queue priority, batch downloads) are enforced server-side. No payment provider is connected; the `subscriptions` table is ready for one.

## Honest limitations

- **Social media links are refused on purpose.** YouTube, TikTok, Instagram, Facebook, X, Vimeo, Twitch, Dailymotion and streaming services don't permit third-party downloads, and ClipForge doesn't scrape or bypass them. Users get a clear message telling them to upload their own file. Direct links to video files (e.g. `https://example.com/talk.mp4`) work. HLS/DASH playlists are not supported.
- **Payments are not live.** Upgrades are done by an admin until a payment provider (Stripe, Paystack, etc.) is wired into `subscriptions`.
- **The local storage driver needs the web app and worker on the same disk.** That's the docker-compose setup. For split hosting, use the S3 driver.

## Architecture

```
Browser ──► Next.js 15 (apps/web)  ── API routes, pages, auth, signed URLs
              │        │
              │        └─► PostgreSQL  (users, projects, videos, jobs, clips, plans…)
              │
              └─► Redis / BullMQ  ──►  Worker (apps/worker)
                                         ├─ FFmpeg / FFprobe
                                         ├─ URL import (SSRF-guarded)
                                         ├─ ZIP builder
                                         └─ hourly cleanup
Storage: local disk (served via HMAC-signed, expiring URLs) or S3-compatible bucket (presigned URLs)
```

| Folder | Purpose |
| --- | --- |
| `apps/web` | Next.js App Router, TypeScript, Tailwind, Radix primitives, lucide icons |
| `apps/worker` | BullMQ worker: probing, importing, clipping, ZIP exports, cleanup |
| `packages/core` | Shared code: clip planning, DB, storage drivers, queue, SSRF guard, limits |
| `db/migrations` | SQL schema |
| `scripts` | `migrate`, `make-admin`, `acceptance` |
| `tests` | Unit tests (Vitest) |

The clip planner in `packages/core/src/plan.ts` is pure and shared by the browser and the worker, so the timeline preview is exactly what gets cut.

### Why not run FFmpeg on Vercel?

Serverless functions have short time limits and small temporary disks. Clipping a one-hour video can take minutes and needs gigabytes of scratch space, so the worker runs as a long-lived process on a server or container. The web app can run anywhere.

## Running locally

Requirements: Node.js 20+, PostgreSQL 14+, Redis 6+, FFmpeg (with libx264, libvpx and libopus; the Debian/Ubuntu `ffmpeg` package has all three).

```bash
npm install
cp .env.example .env                       # then set SIGNING_SECRET (openssl rand -base64 48)
createdb clipforge                         # or point DATABASE_URL at any Postgres
npm run migrate
npm run dev                                # web on http://localhost:3000
npm run dev:worker                         # in a second terminal
```

Register an account, then make yourself an admin:

```bash
npm run make-admin -- you@example.com
```

## Deploying for free

### Option A: one server with Docker Compose (simplest)

Any VPS works, including free-tier cloud VMs. Everything (Postgres, Redis, web, worker, files) runs on the one machine.

```bash
cp .env.example .env    # set SIGNING_SECRET and APP_URL=https://your-domain
docker compose up -d --build
docker compose run --rm web npm run migrate
docker compose run --rm web npm run make-admin -- you@example.com
```

Put a reverse proxy (Caddy or Nginx) in front for HTTPS. If you use Nginx, raise `client_max_body_size` above the upload part size (8 MB by default; larger files use larger parts, see `apps/web/app/api/uploads/route.ts`).

### Option B: split hosting

- **Web:** Vercel, Netlify or any Node host. Set `STORAGE_DRIVER=s3`.
- **Database:** any hosted PostgreSQL with a free tier (set `DATABASE_SSL=true` if it requires TLS).
- **Redis:** any Redis 6+ instance reachable by both web and worker. BullMQ polls Redis continuously, so per-command-priced Redis plans can run out quickly; a small self-hosted Redis next to the worker is the safest choice.
- **Storage:** an S3-compatible bucket (Cloudflare R2, Backblaze B2, MinIO). Configure CORS so the browser can upload parts directly:

  ```json
  [{ "AllowedOrigins": ["https://your-domain"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
  ```
- **Worker:** a VM or container host that can run long processes and has FFmpeg (the Dockerfile installs it). Run `npm run start:worker`.

## Security

- Email/password auth with bcrypt (cost 12). Sessions are random 256-bit tokens; only their SHA-256 hash is stored. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS. State-changing API calls also check the `Origin` header.
- Every query that reads user data is scoped by `user_id` in `apps/web/lib/data.ts`; requests for someone else's IDs return 404. The acceptance test checks 11 cross-account requests and URL tampering.
- Files are never public. Local files are served only through HMAC-signed URLs that expire; S3 objects use presigned URLs. Share links are opt-in per clip and can be revoked.
- Uploads are checked by extension and MIME type, size against the plan, and then by FFprobe; anything without a video stream is rejected and deleted.
- URL import blocks private, loopback, link-local, CGNAT and cloud-metadata addresses. The check runs at connect time inside the HTTP client, so DNS rebinding can't slip past it, and every redirect is re-validated. Downloads are size-capped while streaming.
- Redis-backed rate limits on sign-up, sign-in, uploads, imports, job creation, retries and exports.
- Duplicate submissions are prevented by an idempotency key with a unique index.
- Hourly cleanup removes expired sessions, ZIPs older than 24 hours, abandoned uploads, stale temp files and old error logs.

## Tests

```bash
npm test                       # unit tests: planner, FFmpeg args, keyframes, SSRF guard
npm run build && npm run test:acceptance   # end-to-end against a real stack
```

The acceptance script generates a 10-minute test video, starts the production web server and the worker, and drives the API the way the browser does. It downloads every clip and checks duration, A/V sync and that each file decodes on its own. It covers:

| Check | What is verified |
| --- | --- |
| Test 1 | 10 min in 60 s clips: 10 playable clips |
| Test 2 | 30 s clips: 20 playable clips |
| Test 3 | 45 s clips: 14 clips, the last one 15 s (600 − 13 × 45) |
| Test 4 | Custom ranges 00:00–01:30, 05:00–06:15, 07:30–09:00 |
| Test 5 | Single-clip download, attachment header, HTTP range requests |
| Test 6 | ZIP of all clips, and of selected clips |
| Test 8 | Interrupted upload resumes; cancel mid-job then retry finishes; corrupt file gives a clear error |
| Test 9 | 11 cross-account requests return 404; tampered and expired signed URLs are refused |
| Extra | Count method, VP9 re-encode with 9:16 crop, fast keyframe mode, duplicate-click protection, validation, SSRF refusals, URL import, project delete removes files |

A note on Test 3 in the original brief: it expected the final clip to hold 30 seconds. Thirteen 45-second clips take 585 seconds, so the 14th clip is 15 seconds long. The app produces 15 seconds, and the test checks for that.

Mobile layouts (Test 7) were checked in a headless browser at phone width; see the screenshots in the pull request or run the app and resize.

## Environment variables

See `.env.example`; every variable is documented there.
