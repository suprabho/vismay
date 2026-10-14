import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { isBookView, parseSeasonSlug } from '@/lib/seasonBooks/plan'
import { BookWorkspace } from '@/components/books/BookWorkspace'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string; slug: string }>
  searchParams: Promise<{ view?: string; spread?: string }>
}

export default async function BookPage({ params, searchParams }: Props) {
  const { appSlug, slug } = await params
  if (appSlug !== 'footshorts' || parseSeasonSlug(slug) == null) notFound()
  if (!(await isAuthed())) redirect(`/login?next=/footshorts/books/${slug}`)
  const { view, spread } = await searchParams
  return <BookWorkspace slug={slug} initialView={isBookView(view) ? view : 'beats'} initialSpread={typeof spread === 'string' ? spread : null} />
}
