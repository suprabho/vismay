import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step), so Next must
  // transpile them. Includes the football vertical for now; @vismay/viz-engine
  // joins once Footshort web actually consumes engine APIs.
  transpilePackages: ['@vismay/footshort-viz'],
};

export default nextConfig;
