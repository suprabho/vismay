import { createStoryVideoHandler } from '@vismay/content-source/handlers/storyVideo'
import {
  dispatchRenderJob,
  isDispatchConfigured,
} from '@/lib/storyVideoDispatch'
import { renderStoryVideo } from '@/lib/storyVideoRender'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export const { GET } = createStoryVideoHandler({
  isDispatchConfigured,
  dispatch: dispatchRenderJob,
  render: renderStoryVideo,
})
