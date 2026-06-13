import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The engine + vertical + content-source all ship TypeScript source (no
  // build step). Next must transpile them so JSX, 'use client' directives,
  // and TS syntax compile inside the app.
  transpilePackages: [
    '@vismay/viz-engine',
    '@vismay/kidzovo-viz',
    '@vismay/content-source',
  ],
}

export default nextConfig
