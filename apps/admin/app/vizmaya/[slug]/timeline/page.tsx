import StageTimelinePage from '@/components/timeline/StageTimelinePage'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function VizmayaTimelinePage({ params }: Props) {
  const { slug } = await params
  return <StageTimelinePage slug={slug} timelinePath={`/vizmaya/${slug}/timeline`} />
}
