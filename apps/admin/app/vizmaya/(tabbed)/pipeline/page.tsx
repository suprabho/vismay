import { redirect } from 'next/navigation'
import { getPipelineEpic } from '@vismay/content-source/pipelines'
import { isAuthed } from '@/lib/adminAuth'
import PipelineClient from './PipelineClient'

export const dynamic = 'force-dynamic'

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ epic?: string }>
}) {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/pipeline')
  const { epic } = await searchParams
  // Unknown epic slugs (stale bookmarks) fall back to the merged feed.
  const initialEpic = epic && getPipelineEpic(epic) ? epic : ''
  return <PipelineClient initialEpic={initialEpic} />
}
