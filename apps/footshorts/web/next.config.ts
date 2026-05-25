import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step), so Next must
  // transpile them. Includes the football vertical for now; @vismay/viz-engine
  // joins once Footshorts web actually consumes engine APIs.
  transpilePackages: ['@vismay/footshorts-viz'],
};

export default nextConfig;
