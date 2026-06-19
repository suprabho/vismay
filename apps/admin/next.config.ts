import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Playwright pulls in native browser drivers — bundling it for the server
  // build breaks at runtime. Marking it external lets render-share routes
  // require it from node_modules at request time. pdf-parse/pdfjs-dist are the
  // same shape: pdfjs loads a separate `pdf.worker.mjs` whose path the bundler
  // mangles ("Setting up fake worker failed"); kept external it resolves the
  // worker from node_modules in the compose ingest route.
  //
  // @llamaindex/liteparse is the same shape as @napi-rs/canvas: it loads a
  // prebuilt `*.node` binding plus `libpdfium.so` at runtime, which webpack
  // can't bundle. Kept external so the compose source-extraction path resolves
  // them from node_modules. On Vercel the native files must also be traced into
  // the function bundle (outputFileTracingIncludes) — if they're missing the
  // extractor falls back to pdf-parse, so a tracing gap degrades, not 500s.
  serverExternalPackages: [
    'playwright',
    'playwright-core',
    'pdf-parse',
    'pdfjs-dist',
    '@napi-rs/canvas',
    '@llamaindex/liteparse',
    'undici',
  ],
  // Force LiteParse's native binding (`*.node`) and the `libpdfium.so` it
  // dlopen's into the compose source-extraction function's trace. Next traces
  // the `.node` from the JS require, but the sibling `.so` is opened at runtime
  // and is otherwise dropped. Globs cover both the pnpm store layout and a
  // hoisted node_modules. Harmless if LiteParse isn't installed.
  outputFileTracingIncludes: {
    '/api/stories/[slug]/canvas/compose/sources': [
      '../../node_modules/.pnpm/@llamaindex+liteparse@*/node_modules/@llamaindex/liteparse/*.{node,so}',
      '../../node_modules/@llamaindex/liteparse/*.{node,so}',
      './node_modules/@llamaindex/liteparse/*.{node,so}',
    ],
  },
  // Workspace packages ship TS source; Next must transpile them so `'use client'`
  // directives, JSX, and TS syntax all work when imported from this app.
  transpilePackages: [
    '@vismay/admin-core',
    '@vismay/content-source',
    '@vismay/story-pipeline',
    '@vismay/viz-engine',
    '@vismay/footshorts-viz',
    '@vismay/f1-viz',
    '@vismay/kidzovo-viz',
    '@vismay/starship-viz',
    '@vismay/verticals',
    '@vismay/ui',
  ],
}

export default nextConfig
