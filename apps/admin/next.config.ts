import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Playwright pulls in native browser drivers — bundling it for the server
  // build breaks at runtime. Marking it external lets render-share routes
  // require it from node_modules at request time. pdf-parse/pdfjs-dist are the
  // same shape: pdfjs loads a separate `pdf.worker.mjs` whose path the bundler
  // mangles ("Setting up fake worker failed"); kept external it resolves the
  // worker from node_modules in the compose ingest route.
  serverExternalPackages: ['playwright', 'playwright-core', 'pdf-parse', 'pdfjs-dist', '@napi-rs/canvas', 'undici'],
  // Workspace packages ship TS source; Next must transpile them so `'use client'`
  // directives, JSX, and TS syntax all work when imported from this app.
  transpilePackages: [
    '@vismay/admin-core',
    '@vismay/content-source',
    '@vismay/story-pipeline',
    '@vismay/viz-engine',
    '@vismay/footshorts-viz',
    '@vismay/f1-viz',
    '@vismay/ui',
  ],
}

export default nextConfig
