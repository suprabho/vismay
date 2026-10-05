import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { vizmayaPublicUrl } from '@/lib/publicSite'
import HtmlStoryEditorClient from '@/components/html-stories/HtmlStoryEditorClient'

export const dynamic = 'force-dynamic'

export default async function NewHtmlStoryPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/html-stories/new')
  return <HtmlStoryEditorClient slug="" create siteUrl={vizmayaPublicUrl} app="vizmaya-fyi" basePath="/vizmaya/html-stories" />
}
