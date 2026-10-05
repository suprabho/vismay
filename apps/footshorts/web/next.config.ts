import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step), so Next must
  // transpile them. @vismay/viz-engine is consumed by the FIFA WC26 epic
  // landing (applyMapPalette + the Mapbox stack); @vismay/html-stories (and the
  // @vismay/content-source modules it reads through) by /s/[slug] and
  // /api/html-stories.
  transpilePackages: [
    '@footshorts/shared',
    '@vismay/footshorts-viz',
    '@vismay/viz-engine',
    '@vismay/story-embed',
    '@vismay/ui',
    '@vismay/html-stories',
    '@vismay/content-source',
  ],
};

export default nextConfig;
