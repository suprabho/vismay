import CanvasPage from '@/components/canvas/CanvasPage'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function VizmayaCanvasPage({ params }: Props) {
  const { slug } = await params
  return <CanvasPage slug={slug} canvasPath={`/vizmaya/${slug}/canvas`} />
}
