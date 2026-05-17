import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getDemoById, type DemoStatus } from '@/lib/demos'
import { defaultDemoContentYaml } from '@/lib/storyDemoConfig'
import DemoEditorClient from '@/components/admin/DemoEditorClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditDemoPage({ params }: Props) {
  if (!(await isAuthed())) redirect('/admin/login?next=/admin/demos')
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const demo = await getDemoById(id)
  if (!demo) notFound()

  return (
    <DemoEditorClient
      demoId={demo.id}
      initial={{
        client_slug: demo.client_slug,
        client_name: demo.client_name,
        story_slug: demo.story_slug,
        status: demo.status as DemoStatus,
        content_yaml: demo.content_yaml ?? '',
        share_card_ids: (demo.share_card_ids ?? []) as Array<{
          parentIndex: number
          subIndex: number
          sliceIndex?: number | null
          variant: string
          label: string
        }>,
      }}
      defaultContentYaml={defaultDemoContentYaml()}
    />
  )
}
