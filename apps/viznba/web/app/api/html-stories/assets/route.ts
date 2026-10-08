import { handleHtmlStoryAssetList, handleHtmlStoryAssetPost } from '@vismay/html-stories/assetsApi'

/**
 * Photos, video and AI illustrations for agent-authored HTML stories, hosted
 * on the story-assets bucket: `Authorization: Bearer $HTML_STORIES_TOKEN`,
 * `?slug=<story slug>`. GET lists the slug's files with their credits; POST
 * copies one from an https URL, generates one, or takes the bytes. The
 * contract lives in packages/html-stories/src/assetsApi.ts, shared with
 * vizmaya.fyi, footshorts and vizf1.
 */

export const dynamic = 'force-dynamic'
// Generating an image or copying a video can take a while.
export const maxDuration = 120

export async function GET(req: Request) {
  return handleHtmlStoryAssetList(req, 'viznba')
}

export async function POST(req: Request) {
  return handleHtmlStoryAssetPost(req, 'viznba')
}
