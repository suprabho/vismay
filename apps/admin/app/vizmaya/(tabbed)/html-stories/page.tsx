import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { HtmlStoriesIndex } from '@/components/html-stories/HtmlStoriesIndex'

export const dynamic = 'force-dynamic'

/** vizmaya.fyi's HTML stories (see components/html-stories/HtmlStoriesIndex). */
export default async function AdminHtmlStoriesPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/html-stories')
  return <HtmlStoriesIndex app="vizmaya-fyi" />
}
