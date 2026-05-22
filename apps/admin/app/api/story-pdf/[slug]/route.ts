import { createStoryPdfHandler } from '@vismay/content-source/handlers/storyPdf'
import {
  dispatchPdfRenderJob,
  isPdfDispatchConfigured,
} from '@vismay/content-source/storyPdfDispatch'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Admin mirror of the public /api/story-pdf route. The admin client (Demo
// editor's Cards preview) fetches this at a same-origin path on
// admin.vizmaya.fyi. No sync render — the admin host has no Playwright, so
// dispatch is the only viable path.
export const { GET } = createStoryPdfHandler({
  isDispatchConfigured: isPdfDispatchConfigured,
  dispatch: dispatchPdfRenderJob,
})
