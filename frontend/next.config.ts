import type { NextConfig } from 'next';

const config: NextConfig = {
  // Isolate the authorized production QA build from an existing user's dev server.
  distDir: process.env.BAYFLOW_E2E_BUILD === '1' ? '.next-f13' : '.next',
};
export default config;
