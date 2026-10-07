import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step), so Next must
  // transpile them. @vismay/viz-engine is consumed by the FIFA WC26 epic
  // landing (applyMapPalette + the Mapbox stack); @vismay/html-stories (and the
  // @vismay/content-source modules it reads through) by /s/[slug] and
  // /api/html-stories (its shared brief handler reaches @vismay/f1-viz's race
  // context builder too).
  transpilePackages: [
    '@footshorts/shared',
    '@vismay/footshorts-viz',
    '@vismay/viz-engine',
    '@vismay/story-embed',
    '@vismay/ui',
    '@vismay/html-stories',
    '@vismay/ai-gateway',
    '@vismay/randomizer',
    '@vismay/content-source',
    '@vismay/f1-viz',
  ],
};

export default nextConfig;
