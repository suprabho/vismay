import { createStoryPdfHandler } from '@vismay/content-source/handlers/storyPdf'
import {
  dispatchPdfRenderJob,
  isPdfDispatchConfigured,
} from '@vismay/content-source/storyPdfDispatch'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// `renderStoryPdf` pulls in `playwright`. Importing it eagerly here makes
// the serverless cold-start crash on Vercel (returning Next's default 500
// HTML page, never reaching the handler's try/catch). Dynamic-import it
// only when the sync path is actually about to execute (local dev without
// dispatch envs); production never loads it.
export const { GET } = createStoryPdfHandler({
  isDispatchConfigured: isPdfDispatchConfigured,
  dispatch: dispatchPdfRenderJob,
  render: async (args) => {
    const { renderStoryPdf } = await import('@/lib/storyPdfRender')
    return renderStoryPdf(args)
  },
})
