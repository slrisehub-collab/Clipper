// Storage abstraction. Two drivers:
//  - local: files on disk, served by the web app through HMAC-signed, expiring URLs.
//           Web and worker must share the same disk/volume (docker-compose, single VPS).
//  - s3:    any S3-compatible bucket (Cloudflare R2, Backblaze B2, MinIO, AWS S3).
//           Presigned URLs for download and for direct browser multipart uploads.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand, ListPartsCommand, ListObjectsV2Command, DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';
import { sign } from './signing';

export interface UploadedPart { partNumber: number; size: number; etag: string }

export interface MultipartRef { uploadId: string; storageKey: string; driverUploadId: string | null }

export interface SignedUrlOptions {
  expiresIn?: number;          // seconds
  downloadName?: string;       // forces attachment with this filename
  contentType?: string;
}

export interface StorageDriver {
  readonly name: 'local' | 's3';
  putFile(key: string, localPath: string, contentType: string): Promise<number>;
  getToFile(key: string, localPath: string): Promise<void>;
  readStream(key: string): Promise<Readable>;
  size(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  signedUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
  createMultipart(key: string, contentType: string): Promise<string | null>;
  partUploadUrl(ref: MultipartRef, partNumber: number, expiresIn?: number): Promise<string>;
  listParts(ref: MultipartRef): Promise<UploadedPart[]>;
  completeMultipart(ref: MultipartRef, parts: { partNumber: number; etag: string }[]): Promise<void>;
  abortMultipart(ref: MultipartRef): Promise<void>;
}

export function assertSafeKey(key: string) {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\') || key.includes('\0')) {
    throw new Error('Invalid storage key');
  }
}

// ---------------------------------------------------------------- local

class LocalStorage implements StorageDriver {
  readonly name = 'local' as const;
  private root = config.storageDir;

  private abs(key: string) {
    assertSafeKey(key);
    const p = path.join(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return p;
  }
  private partsDir(uploadId: string) {
    if (!/^[0-9a-f-]{36}$/.test(uploadId)) throw new Error('Invalid upload id');
    return path.join(this.root, '.parts', uploadId);
  }

  /** Absolute path, used by the file-serving route. */
  absolutePath(key: string) { return this.abs(key); }

  async putFile(key: string, localPath: string): Promise<number> {
    const dest = this.abs(key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fsp.rename(localPath, dest);
    } catch {
      await fsp.copyFile(localPath, dest);
    }
    return (await fsp.stat(dest)).size;
  }
  async getToFile(key: string, localPath: string) {
    await fsp.mkdir(path.dirname(localPath), { recursive: true });
    await fsp.copyFile(this.abs(key), localPath);
  }
  async readStream(key: string) { return fs.createReadStream(this.abs(key)); }
  async size(key: string) {
    try { return (await fsp.stat(this.abs(key))).size; } catch { return null; }
  }
  async delete(key: string) { await fsp.rm(this.abs(key), { force: true }); }
  async deletePrefix(prefix: string) {
    assertSafeKey(prefix);
    await fsp.rm(path.join(this.root, prefix), { recursive: true, force: true });
  }
  async signedUrl(key: string, opts: SignedUrlOptions = {}) {
    assertSafeKey(key);
    const exp = Math.floor(Date.now() / 1000) + (opts.expiresIn ?? 3600);
    const d = opts.downloadName ?? '';
    const s = sign(['file', key, exp, d]);
    const q = new URLSearchParams({ k: key, e: String(exp), s });
    if (d) q.set('d', d);
    return `/api/files?${q.toString()}`;
  }
  async createMultipart() { return null; }
  async partUploadUrl(ref: MultipartRef, partNumber: number, expiresIn = 3600) {
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const s = sign(['part', ref.uploadId, partNumber, exp]);
    return `/api/uploads/${ref.uploadId}/parts/${partNumber}?e=${exp}&s=${s}`;
  }
  /** Called by the part-upload route for the local driver. Writes atomically. */
  async writePart(uploadId: string, partNumber: number, body: Readable): Promise<UploadedPart> {
    const dir = this.partsDir(uploadId);
    await fsp.mkdir(dir, { recursive: true });
    const final = path.join(dir, String(partNumber));
    const tmp = `${final}.${process.pid}.${Date.now()}.tmp`;
    await pipeline(body, fs.createWriteStream(tmp));
    await fsp.rename(tmp, final);
    const size = (await fsp.stat(final)).size;
    return { partNumber, size, etag: `local-${partNumber}-${size}` };
  }
  async listParts(ref: MultipartRef) {
    const dir = this.partsDir(ref.uploadId);
    let names: string[] = [];
    try { names = await fsp.readdir(dir); } catch { return []; }
    const parts: UploadedPart[] = [];
    for (const n of names) {
      if (!/^\d+$/.test(n)) continue;
      const size = (await fsp.stat(path.join(dir, n))).size;
      parts.push({ partNumber: Number(n), size, etag: `local-${n}-${size}` });
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }
  async completeMultipart(ref: MultipartRef, parts: { partNumber: number }[]) {
    const dir = this.partsDir(ref.uploadId);
    const dest = this.abs(ref.storageKey);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.assembling`;
    const out = fs.createWriteStream(tmp);
    try {
      for (const p of [...parts].sort((a, b) => a.partNumber - b.partNumber)) {
        await pipeline(fs.createReadStream(path.join(dir, String(p.partNumber))), out, { end: false });
      }
      await new Promise<void>((res, rej) => out.end((err?: Error | null) => (err ? rej(err) : res())));
    } catch (e) {
      out.destroy();
      await fsp.rm(tmp, { force: true });
      throw e;
    }
    await fsp.rename(tmp, dest);
    await fsp.rm(dir, { recursive: true, force: true });
  }
  async abortMultipart(ref: MultipartRef) {
    await fsp.rm(this.partsDir(ref.uploadId), { recursive: true, force: true });
  }
  /** Removes part directories untouched for `maxAgeMs`. Used by cleanup. */
  async cleanupStaleParts(maxAgeMs: number) {
    const base = path.join(this.root, '.parts');
    let dirs: string[] = [];
    try { dirs = await fsp.readdir(base); } catch { return 0; }
    let removed = 0;
    for (const d of dirs) {
      const st = await fsp.stat(path.join(base, d)).catch(() => null);
      if (st && Date.now() - st.mtimeMs > maxAgeMs) {
        await fsp.rm(path.join(base, d), { recursive: true, force: true });
        removed++;
      }
    }
    return removed;
  }
}

// ---------------------------------------------------------------- s3

class S3Storage implements StorageDriver {
  readonly name = 's3' as const;
  private client = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    forcePathStyle: config.s3.forcePathStyle,
    credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
  });
  private bucket = config.s3.bucket;

  async putFile(key: string, localPath: string, contentType: string) {
    assertSafeKey(key);
    const size = (await fsp.stat(localPath)).size;
    const PART = 16 * 1024 * 1024;
    if (size <= PART) {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: fs.createReadStream(localPath), ContentLength: size, ContentType: contentType }));
      return size;
    }
    // Multipart for large files (ZIPs, long clips).
    const { UploadId } = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }));
    const parts: { PartNumber: number; ETag: string }[] = [];
    try {
      for (let i = 0, n = 1; i < size; i += PART, n++) {
        const len = Math.min(PART, size - i);
        const r = await this.client.send(new UploadPartCommand({
          Bucket: this.bucket, Key: key, UploadId, PartNumber: n, ContentLength: len,
          Body: fs.createReadStream(localPath, { start: i, end: i + len - 1 }),
        }));
        parts.push({ PartNumber: n, ETag: r.ETag! });
      }
      await this.client.send(new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId, MultipartUpload: { Parts: parts } }));
    } catch (e) {
      await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId })).catch(() => {});
      throw e;
    }
    return size;
  }
  async getToFile(key: string, localPath: string) {
    await fsp.mkdir(path.dirname(localPath), { recursive: true });
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    await pipeline(r.Body as Readable, fs.createWriteStream(localPath));
  }
  async readStream(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return r.Body as Readable;
  }
  async size(key: string) {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return r.ContentLength ?? null;
    } catch { return null; }
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async deletePrefix(prefix: string) {
    assertSafeKey(prefix);
    let token: string | undefined;
    do {
      const r = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (r.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys } }));
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
  }
  async signedUrl(key: string, opts: SignedUrlOptions = {}) {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket, Key: key,
      ResponseContentDisposition: opts.downloadName ? `attachment; filename="${opts.downloadName.replace(/"/g, '')}"` : undefined,
      ResponseContentType: opts.contentType,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: opts.expiresIn ?? 3600 });
  }
  async createMultipart(key: string, contentType: string) {
    const r = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }));
    return r.UploadId!;
  }
  async partUploadUrl(ref: MultipartRef, partNumber: number, expiresIn = 3600) {
    const cmd = new UploadPartCommand({ Bucket: this.bucket, Key: ref.storageKey, UploadId: ref.driverUploadId!, PartNumber: partNumber });
    return getSignedUrl(this.client, cmd, { expiresIn });
  }
  async listParts(ref: MultipartRef) {
    const out: UploadedPart[] = [];
    let marker: string | undefined;
    do {
      const r = await this.client.send(new ListPartsCommand({ Bucket: this.bucket, Key: ref.storageKey, UploadId: ref.driverUploadId!, PartNumberMarker: marker }));
      for (const p of r.Parts ?? []) out.push({ partNumber: p.PartNumber!, size: p.Size ?? 0, etag: p.ETag ?? '' });
      marker = r.IsTruncated ? r.NextPartNumberMarker : undefined;
    } while (marker);
    return out;
  }
  async completeMultipart(ref: MultipartRef, parts: { partNumber: number; etag: string }[]) {
    await this.client.send(new CompleteMultipartUploadCommand({
      Bucket: this.bucket, Key: ref.storageKey, UploadId: ref.driverUploadId!,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    }));
  }
  async abortMultipart(ref: MultipartRef) {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: ref.storageKey, UploadId: ref.driverUploadId! })).catch(() => {});
  }
}

const g = globalThis as unknown as { __clipforgeStorage?: StorageDriver };

export function storage(): StorageDriver {
  if (!g.__clipforgeStorage) g.__clipforgeStorage = config.storageDriver === 's3' ? new S3Storage() : new LocalStorage();
  return g.__clipforgeStorage;
}

export function localStorageDriver(): LocalStorage {
  const s = storage();
  if (!(s instanceof LocalStorage)) throw new Error('Local storage driver is not active');
  return s;
}

export const keys = {
  source: (userId: string, videoId: string, ext: string) => `users/${userId}/videos/${videoId}/source.${ext}`,
  sourceThumb: (userId: string, videoId: string) => `users/${userId}/videos/${videoId}/thumb.jpg`,
  clip: (userId: string, jobId: string, idx: number, ext: string) => `users/${userId}/jobs/${jobId}/clip-${String(idx).padStart(4, '0')}.${ext}`,
  clipThumb: (userId: string, jobId: string, idx: number) => `users/${userId}/jobs/${jobId}/clip-${String(idx).padStart(4, '0')}.jpg`,
  jobPrefix: (userId: string, jobId: string) => `users/${userId}/jobs/${jobId}/`,
  videoPrefix: (userId: string, videoId: string) => `users/${userId}/videos/${videoId}/`,
  export: (userId: string, exportId: string) => `users/${userId}/exports/${exportId}.zip`,
  userPrefix: (userId: string) => `users/${userId}/`,
};
