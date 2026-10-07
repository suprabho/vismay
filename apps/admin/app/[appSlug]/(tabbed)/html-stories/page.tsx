import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { htmlStoryAppForSection } from '@/lib/htmlStoryApps'
import { HtmlStoriesIndex } from '@/components/html-stories/HtmlStoriesIndex'

export const dynamic = 'force-dynamic'

/**
 * HTML stories for an app that hosts them under the dynamic section — today
 * footshorts (/footshorts/html-stories) and vizf1 (/vizf1/html-stories).
 * vizmaya keeps /vizmaya/html-stories.
 */
export default async function AppHtmlStoriesPage({ params }: { params: Promise<{ appSlug: string }> }) {
  const { appSlug } = await params
  const app = htmlStoryAppForSection(appSlug)
  if (!app || app === 'vizmaya-fyi') notFound()
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/html-stories`)
  return <HtmlStoriesIndex app={app} />
}
