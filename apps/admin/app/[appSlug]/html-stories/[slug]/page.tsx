import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { htmlStoriesBasePath, htmlStoryAppForSection, htmlStorySiteUrl } from '@/lib/htmlStoryApps'
import HtmlStoryEditorClient from '@/components/html-stories/HtmlStoryEditorClient'

export const dynamic = 'force-dynamic'

export default async function AppHtmlStoryPage({ params }: { params: Promise<{ appSlug: string; slug: string }> }) {
  const { appSlug, slug } = await params
  const app = htmlStoryAppForSection(appSlug)
  if (!app || app === 'vizmaya-fyi') notFound()
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/html-stories/${slug}`)
  return (
    <HtmlStoryEditorClient
      slug={slug}
      create={false}
      siteUrl={htmlStorySiteUrl(app)}
      app={app}
      basePath={htmlStoriesBasePath(app)}
    />
  )
}
