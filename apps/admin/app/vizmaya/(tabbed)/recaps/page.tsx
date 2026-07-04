import { redirect } from 'next/navigation'
import { getPipelineEpic } from '@vismay/content-source/pipelines'
import { isAuthed } from '@/lib/adminAuth'
import RecapsClient from './RecapsClient'

export const dynamic = 'force-dynamic'

export default async function RecapsPage({
  searchParams,
}: {
  searchParams: Promise<{ epic?: string }>
}) {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/recaps')
  const { epic } = await searchParams
  // Unknown epic slugs (stale bookmarks) fall back to the merged timeline.
  const initialEpic = epic && getPipelineEpic(epic) ? epic : ''
  return <RecapsClient initialEpic={initialEpic} />
}
