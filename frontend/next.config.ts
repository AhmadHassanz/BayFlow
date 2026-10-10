import type { NextConfig } from 'next';

const config: NextConfig = {
  // Isolate the authorized production QA build from an existing user's dev server.
  distDir: process.env.BAYFLOW_E2E_BUILD === '1' ? '.next-f13' : '.next',
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};
export default config;
