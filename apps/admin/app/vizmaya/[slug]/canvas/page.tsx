import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getStoryContent } from '@vismay/content-source/content'
import {
  loadStoryConfig,
  hasStoryConfig,
} from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import CanvasClient from '@/components/vizmaya/canvas/CanvasClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function CanvasPage({ params }: Props) {
  const { slug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/vizmaya/${slug}/canvas`)
  if (!(await hasStoryConfig(slug))) notFound()

  const [story, config] = await Promise.all([
    getStoryContent(slug),
    loadStoryConfig(slug),
  ])

  const { units } = resolveUnits(slug, story.sections, config)

  // The canvas iframes vizmaya-fyi's single-section render route. URL
  // comes from env so dev (localhost:3000) and prod (subdomain) both
  // work without code changes; default keeps the dev loop unblocked.
  const publicSiteUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  return (
    <CanvasClient slug={slug} units={units} publicSiteUrl={publicSiteUrl} />
  )
}
