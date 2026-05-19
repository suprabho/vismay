import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@vismay/content-source/contentSource'
import ChartEditorClient from '@/components/vizmaya/ChartEditorClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string; id: string }>
}

export default async function EditChartPage({ params }: Props) {
  const { slug, id } = await params
  if (!(await isAuthed())) redirect(`/login?next=/vizmaya/${slug}/charts/${id}`)
  const data = await getContentSource().readChart(slug, id)
  if (data == null) notFound()
  return <ChartEditorClient slug={slug} chartId={id} initial={JSON.stringify(data, null, 2)} />
}
