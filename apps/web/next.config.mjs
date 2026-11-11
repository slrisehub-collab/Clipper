/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@clipforge/core'],
  serverExternalPackages: ['pg', 'bullmq', 'ioredis', 'bcryptjs', 'undici'],
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};
export default nextConfig;
