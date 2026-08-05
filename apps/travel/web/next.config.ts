import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step). Next must
  // transpile them so JSX, 'use client' directives, and TS syntax compile
  // inside the app.
  transpilePackages: [
    '@vismay/viz-engine',
    '@vismay/story-reader',
    '@vismay/content-source',
    '@vismay/travel-viz',
    '@vismay/admin-core',
  ],
  // Every trip route is force-dynamic (the password gate reads cookies), so
  // content is read from the filesystem per request — make sure Vercel's
  // output tracing bundles the content dir into the serverless functions.
  outputFileTracingIncludes: {
    '/t/**': ['./content/stories/**'],
    '/upload': ['./content/stories/**'],
  },
}

export default nextConfig
