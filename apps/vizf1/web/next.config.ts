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
}

export default nextConfig
