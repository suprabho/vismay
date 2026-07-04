import { createStoryNewsletterHandler } from '@vismay/content-source/handlers/storyNewsletter'
import {
  dispatchNewsletterRenderJob,
  isNewsletterDispatchConfigured,
} from '@vismay/content-source/storyNewsletterDispatch'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// `renderStoryNewsletterLocal` pulls in `playwright`. Importing it eagerly
// here makes the serverless cold-start crash on Vercel — dynamic-import it
// only when the sync path is actually about to execute (local dev without
// dispatch envs); production never loads it.
export const { GET } = createStoryNewsletterHandler({
  isDispatchConfigured: isNewsletterDispatchConfigured,
  dispatch: dispatchNewsletterRenderJob,
  render: async (args) => {
    const { renderStoryNewsletterLocal } = await import('@/lib/storyNewsletterRender')
    return renderStoryNewsletterLocal(args)
  },
})
