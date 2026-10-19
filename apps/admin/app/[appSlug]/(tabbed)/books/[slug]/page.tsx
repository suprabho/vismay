import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { parseSeasonSlug } from '@/lib/seasonBooks/plan'
import { BookWorkspace } from '@/components/books/BookWorkspace'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string; slug: string }>
  searchParams: Promise<{ view?: string; spread?: string; tab?: string }>
}

const str = (v: unknown) => (typeof v === 'string' && v.length <= 120 ? v : null)

/**
 * One book. `?view=` deep-links a planner view (beats|flatplan|cards|chapters
 * for claim spreads; roster|spreads|editor|flatplan|legacy for season
 * spreads, plus system for both), `?spread=` a card or spread key and `?tab=`
 * an editor tab; the planner for the book's format validates them.
 */
export default async function BookPage({ params, searchParams }: Props) {
  const { appSlug, slug } = await params
  if (appSlug !== 'footshorts' || parseSeasonSlug(slug) == null) notFound()
  if (!(await isAuthed())) redirect(`/login?next=/footshorts/books/${slug}`)
  const { view, spread, tab } = await searchParams
  return <BookWorkspace slug={slug} initial={{ view: str(view), spread: str(spread), tab: str(tab) }} />
}
