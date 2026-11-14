import { describe, expect, it } from 'vitest';
import { buildClipArgs, nearestKeyframe, snapToKeyframes, startsOnKeyframe, videoFilter } from '../packages/core/src/encode';

const cfg = { method: 'duration', segmentSeconds: 60, format: 'mp4', quality: 'original', aspect: 'original', aspectMode: 'crop', keepAudio: true, cutMode: 'precise' } as const;
const src = { width: 1920, height: 1080, hasAudio: true };

describe('ffmpeg args', () => {
  it('seeks before input and limits duration', () => {
    const a = buildClipArgs({ input: 'in.mp4', output: 'out.mp4', segment: { start: 60, end: 120 }, cfg, src, copy: false });
    expect(a.slice(0, 6)).toEqual(['-ss', '60.000', '-i', 'in.mp4', '-t', '60.000']);
    expect(a).toContain('libx264');
    expect(a).toContain('+faststart');
    expect(a[a.length - 1]).toBe('out.mp4');
  });
  it('stream copies when asked', () => {
    const a = buildClipArgs({ input: 'in.mp4', output: 'out.mp4', segment: { start: 0, end: 10 }, cfg, src, copy: true });
    expect(a).toContain('copy');
    expect(a).not.toContain('libx264');
  });
  it('drops audio', () => {
    const a = buildClipArgs({ input: 'i', output: 'o', segment: { start: 0, end: 10 }, cfg: { ...cfg, keepAudio: false }, src, copy: false });
    expect(a).toContain('-an');
  });
  it('uses VP9/Opus for webm', () => {
    const a = buildClipArgs({ input: 'i', output: 'o.webm', segment: { start: 0, end: 10 }, cfg: { ...cfg, format: 'webm' }, src, copy: false });
    expect(a).toContain('libvpx-vp9');
    expect(a).toContain('libopus');
  });
  it('crops or pads rather than stretching', () => {
    expect(videoFilter({ quality: 'original', aspect: '9:16', aspectMode: 'crop' }, src)).toContain('force_original_aspect_ratio=increase');
    expect(videoFilter({ quality: 'original', aspect: '9:16', aspectMode: 'crop' }, src)).toContain('crop=1080:1920');
    expect(videoFilter({ quality: 'original', aspect: '1:1', aspectMode: 'fit' }, src)).toContain('pad=1080:1080');
  });
});

describe('keyframes', () => {
  const kfs = [0, 2, 4, 6, 8, 10];
  it('finds nearest', () => { expect(kfs[nearestKeyframe(kfs, 4.9)]).toBe(4); expect(kfs[nearestKeyframe(kfs, 5.1)]).toBe(6); });
  it('snaps contiguous segments', () => {
    expect(snapToKeyframes([{ start: 0, end: 3.1 }, { start: 3.1, end: 7.2 }, { start: 7.2, end: 11 }], kfs, 11))
      .toEqual([{ start: 0, end: 4 }, { start: 4, end: 8 }, { start: 8, end: 11 }]);
  });
  it('detects keyframe-aligned starts', () => { expect(startsOnKeyframe(kfs, 4.01, 25)).toBe(true); expect(startsOnKeyframe(kfs, 4.5, 25)).toBe(false); });
});
