import { serveFormatAsset } from '@vismay/html-stories/formatsApi'

/**
 * The story format runtimes HTML stories load (/formats/book@1.js and .css,
 * board@1…, deck@1…, story@1.js) and their reference pages
 * (/formats/examples/odyssey-book.html, …). Public and CORS-open: stories run
 * in an opaque-origin sandbox. Shared with footshorts; see
 * packages/html-stories/src/formatsApi.ts.
 */

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return serveFormatAsset(path.join('/'))
}
