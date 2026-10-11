import { handleHtmlStoryAssetList, handleHtmlStoryAssetPost } from '@vismay/html-stories/assetsApi'

/**
 * Extra images for travel HTML stories (an openly licensed map or archive
 * photo; the trip's own photos are already hosted), on the story-assets
 * bucket: `Authorization: Bearer $HTML_STORIES_TOKEN`, `?slug=<story slug>`.
 * The contract lives in packages/html-stories/src/assetsApi.ts.
 */

export const dynamic = 'force-dynamic'
// Copying a video can take a while.
export const maxDuration = 120

export async function GET(req: Request) {
  return handleHtmlStoryAssetList(req, 'travel')
}

export async function POST(req: Request) {
  return handleHtmlStoryAssetPost(req, 'travel')
}
