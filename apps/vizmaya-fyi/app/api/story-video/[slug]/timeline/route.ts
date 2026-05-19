import { createStoryVideoTimelineHandler } from '@vismay/content-source/handlers/storyVideoTimeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const { GET } = createStoryVideoTimelineHandler()
