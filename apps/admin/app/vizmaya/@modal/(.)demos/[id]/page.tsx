import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getDemoById, type DemoStatus } from '@vismay/content-source/demos'
import { defaultDemoContentYaml } from '@vismay/content-source/storyDemoConfig'
import DemoEditorClient from '@/components/vizmaya/DemoEditorClient'
import { RouteEditPanel } from '@/components/admin'

export const dynamic = 'force-dynamic'

export default async function DemoEditModal({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/demos')
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const demo = await getDemoById(id)
  if (!demo) notFound()
  return (
    <RouteEditPanel size="wide" label={`Edit demo ${demo.client_name}`}>
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
    </RouteEditPanel>
  )
}
