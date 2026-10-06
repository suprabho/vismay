/**
 * GET <site>/formats/<file> on each hosting site: the story format runtimes
 * an HTML story loads (book@1.js + book@1.css, board@1…, deck@1…, and
 * story@1.js alone) and the reference pages the brief links to
 * (examples/odyssey-book.html, …). Sources live in ../formats; they are
 * bundled into ./formatAssets.generated.ts by scripts/gen-format-assets.mts,
 * so serving them needs no file system.
 *
 * Stories run in an opaque-origin sandbox, so everything is public and
 * CORS-open. A major version (@1) takes fixes in place, so the cache is
 * hours, not forever; the reference pages are served under the same CSP
 * sandbox as a story.
 *
 * Server only (the bundle is ~200 KB of strings).
 */

import { FORMAT_ASSETS } from './formatAssets.generated'
import { HTML_STORY_SANDBOX_CSP } from './meta'

const TYPES: Record<string, string> = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
}

/** The published paths, for tests and listings. */
export function formatAssetPaths(): string[] {
  return Object.keys(FORMAT_ASSETS)
}

/** GET /formats/[...path], given the path after /formats/. */
export function serveFormatAsset(path: string): Response {
  const body = Object.prototype.hasOwnProperty.call(FORMAT_ASSETS, path) ? FORMAT_ASSETS[path] : undefined
  const type = TYPES[path.slice(path.lastIndexOf('.') + 1)]
  if (body === undefined || !type) {
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, s-maxage=60' },
    })
  }
  const headers: Record<string, string> = {
    'content-type': type,
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
    // Browsers re-check hourly; the CDN copy lives a day (a deploy starts it fresh).
    'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
  }
  if (type.startsWith('text/html')) headers['content-security-policy'] = HTML_STORY_SANDBOX_CSP
  return new Response(body, { headers })
}
