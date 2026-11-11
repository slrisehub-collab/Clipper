import dns from 'node:dns';
import { describe, expect, it, vi } from 'vitest';
import { checkUrlShape, isPrivateIp, safeFetch } from '../packages/core/src/ssrf';

describe('SSRF guard', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])('blocks %s', (ip) => expect(isPrivateIp(ip)).toBe(true));
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows %s', (ip) => expect(isPrivateIp(ip)).toBe(false));
  it.each([
    'file:///etc/passwd', 'ftp://example.com/a.mp4', 'http://localhost/a.mp4', 'http://127.0.0.1/a.mp4', 'http://[::1]/a.mp4',
    'http://169.254.169.254/latest/meta-data', 'http://user:pw@example.com/a.mp4', 'http://example.com:6379/', 'http://metadata.google.internal/',
  ])('rejects %s', (u) => expect(() => checkUrlShape(u)).toThrow());
  it.each(['https://www.youtube.com/watch?v=x', 'https://youtu.be/x', 'https://www.tiktok.com/@a/video/1', 'https://vimeo.com/1'])('refuses platform page %s', (u) => expect(() => checkUrlShape(u)).toThrow(/upload the file/));
  it('accepts a normal https file link', () => expect(checkUrlShape('https://example.com/video.mp4').hostname).toBe('example.com'));
  it('blocks a public-looking hostname that resolves to a private address (DNS rebinding)', async () => {
    const spy = vi.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: any, cb: any) => cb(null, [{ address: '10.0.0.5', family: 4 }])) as any);
    await expect(safeFetch('http://videos.example-attacker.com/x.mp4')).rejects.toThrow(/private or internal address/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
