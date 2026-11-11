import { describe, expect, it } from 'vitest';
import { availableQualities, needsTransform, outputSize, parseTimestamp, planSegments, splitByCount, splitByLength, formatTimestamp } from '../packages/core/src/plan';

const base = { format: 'mp4', quality: 'original', aspect: 'original', aspectMode: 'crop', keepAudio: true, cutMode: 'precise' } as const;

describe('splitByLength', () => {
  it('10 min / 60 s gives 10 clips', () => {
    const s = splitByLength(600, 60);
    expect(s).toHaveLength(10);
    expect(s[9]).toEqual({ start: 540, end: 600 });
  });
  it('10 min / 30 s gives 20 clips', () => expect(splitByLength(600, 30)).toHaveLength(20));
  it('10 min / 45 s gives 14 clips, last one is the 15 s remainder', () => {
    const s = splitByLength(600, 45);
    expect(s).toHaveLength(14);
    expect(s[13]).toEqual({ start: 585, end: 600 });
    expect(s[13].end - s[13].start).toBe(15);
  });
  it('60 min / 60 s gives 60 clips', () => expect(splitByLength(3600, 60)).toHaveLength(60));
  it('ignores floating-point crumbs at the end', () => expect(splitByLength(600.02, 60)).toHaveLength(10));
  it('keeps a real short remainder', () => expect(splitByLength(600.5, 60)).toHaveLength(11));
  it('rejects tiny lengths', () => expect(() => splitByLength(600, 0.5)).toThrow());
  it('segments are contiguous and cover the whole video', () => {
    const s = splitByLength(1234.567, 37);
    for (let i = 1; i < s.length; i++) expect(s[i].start).toBe(s[i - 1].end);
    expect(s[0].start).toBe(0);
    expect(s[s.length - 1].end).toBe(1234.567);
  });
});

describe('splitByCount', () => {
  it('30 min into 10 clips of 3 minutes', () => {
    const s = splitByCount(1800, 10);
    expect(s).toHaveLength(10);
    expect(s.every((x) => Math.abs(x.end - x.start - 180) < 0.001)).toBe(true);
  });
  it('last clip ends exactly at duration', () => expect(splitByCount(100, 3)[2].end).toBe(100));
  it('rejects non-integers', () => expect(() => splitByCount(100, 2.5)).toThrow());
});

describe('custom ranges', () => {
  it('validates and clamps', () => {
    const s = planSegments({ method: 'custom', ranges: [{ start: 0, end: 90 }, { start: 300, end: 375 }, { start: 750, end: 9999 }] }, 800);
    expect(s).toEqual([{ start: 0, end: 90 }, { start: 300, end: 375 }, { start: 750, end: 800 }]);
  });
  it('rejects end before start', () => expect(() => planSegments({ method: 'custom', ranges: [{ start: 10, end: 5 }] }, 100)).toThrow(/end must be after start/));
  it('rejects ranges past the end', () => expect(() => planSegments({ method: 'custom', ranges: [{ start: 200, end: 210 }] }, 100)).toThrow(/after the video ends/));
  it('rejects NaN', () => expect(() => planSegments({ method: 'custom', ranges: [{ start: NaN, end: 5 }] }, 100)).toThrow());
});

describe('timestamps', () => {
  it.each([['1:30', 90], ['01:02:03', 3723], ['90', 90], ['1m30s', 90], ['12:30.5', 750.5], ['2h', 7200]])('parses %s', (i, o) => expect(parseTimestamp(i)).toBe(o));
  it.each(['', 'abc', '1:99', '1::2'])('rejects %s', (i) => expect(parseTimestamp(i)).toBeNaN());
  it('formats', () => { expect(formatTimestamp(3723)).toBe('1:02:03'); expect(formatTimestamp(65)).toBe('01:05'); });
});

describe('output geometry', () => {
  it('only offers qualities that do not upscale', () => {
    expect(availableQualities(1920, 1080)).toEqual(['original', '1080', '720', '480']);
    expect(availableQualities(1280, 720)).toEqual(['original', '720', '480']);
    expect(availableQualities(640, 360)).toEqual(['original']);
    expect(availableQualities(1080, 1920)).toEqual(['original', '1080', '720', '480']);
  });
  it('sizes for aspect changes', () => {
    expect(outputSize(1920, 1080, '720', 'original')).toEqual({ width: 1280, height: 720 });
    expect(outputSize(1920, 1080, 'original', '9:16')).toEqual({ width: 1080, height: 1920 });
    expect(outputSize(1920, 1080, '720', '1:1')).toEqual({ width: 720, height: 720 });
    expect(outputSize(1920, 1080, 'original', 'original')).toEqual({ width: 1920, height: 1080 });
    expect(outputSize(1081, 721, 'original', 'original')).toEqual({ width: 1082, height: 722 });
  });
  it('knows when stream copy is possible', () => {
    expect(needsTransform(base, 'h264', 'aac')).toBe(false);
    expect(needsTransform({ ...base, format: 'webm' }, 'h264', 'aac')).toBe(true);
    expect(needsTransform({ ...base, quality: '720' }, 'h264', 'aac')).toBe(true);
    expect(needsTransform({ ...base, keepAudio: false }, 'h264', 'opus')).toBe(false);
    expect(needsTransform(base, 'h264', 'opus')).toBe(true);
  });
});
