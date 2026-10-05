import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { htmlStoriesBasePath, htmlStoryAppForSection, htmlStorySiteUrl } from '@/lib/htmlStoryApps'
import HtmlStoryEditorClient from '@/components/html-stories/HtmlStoryEditorClient'

export const dynamic = 'force-dynamic'

export default async function AppNewHtmlStoryPage({ params }: { params: Promise<{ appSlug: string }> }) {
  const { appSlug } = await params
  const app = htmlStoryAppForSection(appSlug)
  if (!app || app === 'vizmaya-fyi') notFound()
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/html-stories/new`)
  return (
    <HtmlStoryEditorClient slug="" create siteUrl={htmlStorySiteUrl(app)} app={app} basePath={htmlStoriesBasePath(app)} />
  )
}
