import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Playwright pulls in native browser drivers — bundling it for the server
  // build breaks at runtime. Marking it external lets render-share routes
  // require it from node_modules at request time.
  serverExternalPackages: ['playwright', 'playwright-core'],
  // Workspace packages ship TS source; Next must transpile them so `'use client'`
  // directives, JSX, and TS syntax all work when imported from this app.
  transpilePackages: [
    '@vismay/admin-core',
    '@vismay/content-source',
    '@vismay/viz-engine',
    '@vismay/footshorts-viz',
    '@vismay/f1-viz',
  ],
}

export default nextConfig
