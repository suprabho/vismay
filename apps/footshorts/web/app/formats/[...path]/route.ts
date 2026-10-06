import { serveFormatAsset } from '@vismay/html-stories/formatsApi'

/**
 * The story format runtimes footshorts HTML stories load (/formats/book@1.js
 * and .css, board@1…, deck@1…) and their reference pages. Public, like /s/<slug>.
 * See packages/html-stories/src/formatsApi.ts.
 */

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return serveFormatAsset(path.join('/'))
}
