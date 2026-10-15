import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step). Next must
  // transpile them so JSX, 'use client' directives, and TS syntax compile
  // inside the app.
  transpilePackages: [
    '@vismay/viz-engine',
    '@vismay/story-reader',
    '@vismay/content-source',
    '@footshorts/shared',
    '@vismay/travel-viz',
    '@vismay/admin-core',
    // HTML stories (/s/[slug], /formats, /api/html-stories) and the workspace
    // packages the shared handlers reach: the brief imports every app's
    // context builder (@vismay/f1-viz's race context among them), the assets
    // endpoint @vismay/ai-gateway.
    '@vismay/html-stories',
    '@vismay/randomizer',
    '@vismay/ai-gateway',
    '@vismay/f1-viz',
  ],
  // Every trip route is force-dynamic (the password gate reads cookies), so
  // content is read from the filesystem per request — make sure Vercel's
  // output tracing bundles the content dir into the serverless functions.
  outputFileTracingIncludes: {
    '/t/**': ['./content/stories/**'],
    '/upload': ['./content/stories/**'],
    // HTML stories' git copies (lib/htmlStories) and, for the brief's trip
    // context, the itinerary + media manifest fallbacks.
    '/s/**': ['./content/html-stories/**'],
    '/api/html-stories/brief': ['./content/stories/**'],
  },
}

export default nextConfig
