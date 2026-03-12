/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL:     API_URL,
    NEXT_PUBLIC_APP_NAME:    'PA Admin Dashboard',
    NEXT_PUBLIC_APP_VERSION: '1.0.0',
  },
  async rewrites() {
    return [
      { source: '/auth/:path*',   destination: `${API_URL}/auth/:path*` },
      { source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',       value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
