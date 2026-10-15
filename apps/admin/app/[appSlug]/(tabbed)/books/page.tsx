import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { BooksIndexClient } from '@/components/books/BooksIndexClient'

export const dynamic = 'force-dynamic'

// The season-book series (one season per book, one month per chapter):
// footshorts-only, like the other football research tabs.
export default async function BooksPage({ params }: { params: Promise<{ appSlug: string }> }) {
  const { appSlug } = await params
  if (appSlug !== 'footshorts') notFound()
  if (!(await isAuthed())) redirect('/login?next=/footshorts/books')
  return <BooksIndexClient />
}
