import { createStoryVideoHandler } from '@vismay/content-source/handlers/storyVideo'
import {
  dispatchVideoRenderJob,
  isVideoDispatchConfigured,
} from '@vismay/content-source/storyVideoDispatch'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// `renderStoryVideo` pulls in `playwright`, which lists as
// `serverExternalPackages` so it can require browser binaries at runtime.
// Importing it eagerly from the route module makes the entire serverless
// function fail to cold-start on Vercel — Next's default 500 HTML page is
// returned, and no try/catch in the handler ever gets a chance to run.
// Dynamic-import it only when the sync path is actually about to execute
// (i.e. local dev without dispatch envs); production never loads it.
export const { GET } = createStoryVideoHandler({
  isDispatchConfigured: isVideoDispatchConfigured,
  dispatch: dispatchVideoRenderJob,
  render: async (args) => {
    const { renderStoryVideo } = await import('@/lib/storyVideoRender')
    return renderStoryVideo(args)
  },
})
