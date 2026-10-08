import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Engine + verticals + workspace brand all ship TypeScript source (no build
  // step). Next must transpile them so JSX, 'use client' directives, and TS
  // syntax compile inside the app. @vismay/html-stories (and the packages it
  // reads through) serve /s/[slug] and /api/html-stories.
  transpilePackages: [
    '@vismay/viz-engine',
    '@vismay/content-source',
    '@vismay/story-embed',
    '@vismay/f1-viz',
    '@vismay/ui',
    '@vizf1/brand',
    '@vismay/html-stories',
    '@vismay/ai-gateway',
    '@vismay/randomizer',
  ],
  // /embed/replay runs inside sandboxed HTML stories (/s/<slug>), an opaque
  // origin, so its own same-site requests are cross-origin: the replay
  // fixtures it falls back to and the self-hosted fonts need CORS (the /api
  // routes it calls set it).
  async headers() {
    const cors = [{ key: 'Access-Control-Allow-Origin', value: '*' }]
    return [
      { source: '/fixtures/:path*', headers: cors },
      { source: '/_next/static/media/:path*', headers: cors },
    ]
  },
}

export default nextConfig
