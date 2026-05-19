import { createStoryPdfHandler } from '@vismay/content-source/handlers/storyPdf'
import {
  dispatchPdfRenderJob,
  isPdfDispatchConfigured,
} from '@/lib/storyPdfDispatch'
import { renderStoryPdf } from '@/lib/storyPdfRender'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export const { GET } = createStoryPdfHandler({
  isDispatchConfigured: isPdfDispatchConfigured,
  dispatch: dispatchPdfRenderJob,
  render: renderStoryPdf,
})
