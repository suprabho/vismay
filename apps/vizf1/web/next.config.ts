import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Engine + verticals + workspace brand all ship TypeScript source (no build
  // step). Next must transpile them so JSX, 'use client' directives, and TS
  // syntax compile inside the app.
  transpilePackages: [
    '@vismay/viz-engine',
    '@vismay/f1-viz',
    '@vizf1/brand',
  ],
}

export default nextConfig
