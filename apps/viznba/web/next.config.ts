import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @vismay/html-stories (and the workspace packages it reads through) serves
  // /s/[slug], /formats and /api/html-stories, and the NBA Desk's spin routes
  // under /api/randomizer. They ship TypeScript source with no build step, so
  // Next must transpile them; the brief handler reaches @vismay/f1-viz's race
  // context builder and the chrome @vismay/viz-engine's aura helpers.
  transpilePackages: [
    '@vismay/html-stories',
    '@vismay/content-source',
    '@vismay/randomizer',
    '@vismay/ai-gateway',
    '@vismay/viz-engine',
    '@vismay/f1-viz',
  ],
}

export default nextConfig
