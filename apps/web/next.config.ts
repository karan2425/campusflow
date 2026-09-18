import type { NextConfig } from 'next';

/**
 * The browser talks to `/api/backend/*` on the same origin; Next proxies those
 * calls to the Express API server-side. Benefits:
 *  • no CORS configuration needed anywhere
 *  • the API host is never exposed to the browser, so it works unchanged in
 *    local dev, Docker Compose and Vercel preview deployments
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @campusflow/shared ships TypeScript source; Next compiles it in-place.
  transpilePackages: ['@campusflow/shared'],
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
  // The preview host is proxied by the platform; allow it to frame the app.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
};

export default nextConfig;
