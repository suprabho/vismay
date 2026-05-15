import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@/lib/contentSource'
import { PlannerClient, type StoryOption } from '@/components/admin/social/PlannerClient'

export const dynamic = 'force-dynamic'

export default async function SocialPlanPage() {
  if (!(await isAuthed())) redirect('/admin/login?next=/admin/social')

  const src = getContentSource()
  const stories = await src.listStories()
  const withTitles: StoryOption[] = await Promise.all(
    stories.map(async (s) => {
      const md = await src.readMarkdown(s.slug)
      const titleMatch = md?.match(/^title:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/m)
      const title = (titleMatch?.[1] ?? titleMatch?.[2] ?? titleMatch?.[3] ?? s.slug).trim()
      return { slug: s.slug, title, status: s.status, listed: s.listed }
    }),
  )
  const sorted = withTitles.sort((a, b) => a.title.localeCompare(b.title))

  return <PlannerClient stories={sorted} />
}
