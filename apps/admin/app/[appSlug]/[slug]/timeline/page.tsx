import StageTimelinePage from '@/components/timeline/StageTimelinePage'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string; slug: string }>
}

/**
 * Universal timeline route — the generic-app mirror of
 * `app/vizmaya/[slug]/timeline`. See `app/[appSlug]/[slug]/canvas/page.tsx`
 * for why this split exists (vertical-agnostic component, vizmaya kept on
 * its own `/vizmaya/...` tree).
 */
export default async function AppTimelinePage({ params }: Props) {
  const { appSlug, slug } = await params
  return <StageTimelinePage slug={slug} timelinePath={`/${appSlug}/${slug}/timeline`} />
}
