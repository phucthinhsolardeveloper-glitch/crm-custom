import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Security headers - use :path* (not /(.*)) to avoid parens conflicting
  // with route group paths like /_next/static/chunks/app/(auth)/login/...
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        ],
      },
      // Prevent CDN/browser caching of HTML to avoid stale chunk references after deploy.
      // Static prerendered routes (e.g. /) otherwise inherit Next.js default
      // Cache-Control: s-maxage=31536000, so a CDN serves year-old HTML pointing at
      // deleted chunk hashes -> 404 on JS/CSS. Negative lookahead excludes _next
      // (static/image assets keep their immutable caching) and api (proxy to backend).
      {
        source: '/((?!_next|api).*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },
  // Proxy API calls to NestJS backend (exclude Next.js API routes like /api/auth)
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api/v1'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
