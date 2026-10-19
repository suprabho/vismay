import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { CREST_FILTERS, isCrestSeason, type CrestFilter } from '@/lib/seasonBooks/crests'
import { CrestsViewer } from '@/components/books/CrestsViewer'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string }>
  searchParams: Promise<{ season?: string; filter?: string; view?: string }>
}

// Books → Crests: the clubs of a season and the crests they wore (footshorts only).
export default async function CrestsPage({ params, searchParams }: Props) {
  const { appSlug } = await params
  if (appSlug !== 'footshorts') notFound()
  if (!(await isAuthed())) redirect('/login?next=/footshorts/books/crests')
  const { season, filter, view } = await searchParams
  return (
    <CrestsViewer
      initialSeason={isCrestSeason(season) ? season : null}
      initialFilter={CREST_FILTERS.includes(filter as CrestFilter) ? filter as CrestFilter : 'all'}
      initialView={view === 'marks' ? 'marks' : 'picked'}
    />
  )
}
