import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Engine + verticals ship TypeScript source (no build step). Next must
  // transpile them so JSX, `'use client'` directives, and TS syntax compile.
  transpilePackages: ['@vismay/viz-engine', '@vismay/f1-viz'],
}

export default nextConfig
