import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step), so Next must
  // transpile them. @vismay/viz-engine is consumed by the FIFA WC26 epic
  // landing (applyMapPalette + the Mapbox stack).
  transpilePackages: ['@footshorts/shared', '@vismay/footshorts-viz', '@vismay/viz-engine', '@vismay/story-embed'],
};

export default nextConfig;
