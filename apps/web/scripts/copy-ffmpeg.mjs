// Copies the FFmpeg WebAssembly build into public/ so the browser clipper loads it
// from the same site (no third-party CDN). Runs before `next dev` and `next build`.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// The package doesn't export package.json, so resolve its main entry and find dist/esm next to it.
const entry = require.resolve('@ffmpeg/core');
const coreDir = path.join(entry.slice(0, entry.lastIndexOf(`${path.sep}dist${path.sep}`)), 'dist', 'esm');
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ffmpeg');
fs.mkdirSync(outDir, { recursive: true });
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) fs.copyFileSync(path.join(coreDir, f), path.join(outDir, f));

// The library's worker script is served as-is too. If the bundler processes it, it rewrites the
// worker's dynamic import() of the core and the engine fails with "Cannot find module".
const ffEntry = require.resolve('@ffmpeg/ffmpeg');
const ffDir = path.join(ffEntry.slice(0, ffEntry.lastIndexOf(`${path.sep}dist${path.sep}`)), 'dist', 'esm');
for (const f of ['worker.js', 'const.js', 'errors.js']) fs.copyFileSync(path.join(ffDir, f), path.join(outDir, f));
console.log('FFmpeg WebAssembly files copied to public/ffmpeg');
