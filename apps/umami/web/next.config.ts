import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step). Next must
  // transpile them so JSX, 'use client' directives, and TS syntax compile
  // inside the app.
  transpilePackages: ['@vismay/story-embed', '@vismay/content-source'],
}

export default nextConfig
