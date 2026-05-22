import { createStoryVideoHandler } from '@vismay/content-source/handlers/storyVideo'
import {
  dispatchVideoRenderJob,
  isVideoDispatchConfigured,
} from '@vismay/content-source/storyVideoDispatch'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Admin runs on its own domain (admin.vizmaya.fyi); the admin client components
// fetch this endpoint at a same-origin path, so we mirror the public route
// here. No sync `render` — the admin host has no Playwright/ffmpeg toolchain,
// so when dispatch isn't configured the handler returns a clear 500.
export const { GET } = createStoryVideoHandler({
  isDispatchConfigured: isVideoDispatchConfigured,
  dispatch: dispatchVideoRenderJob,
})
