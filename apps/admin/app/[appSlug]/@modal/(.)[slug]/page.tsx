import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { loadStoryEditorData } from '@/lib/storyEditorData'
import { signStoryLinks } from '@/lib/signedConsumerLinks'
import EditorClient from '@/components/vizmaya/EditorClient'
import { RouteEditPanel } from '@/components/admin'

export const dynamic = 'force-dynamic'

export default async function AppStoryEditModal({ params }: { params: Promise<{ appSlug: string; slug: string }> }) {
  const { appSlug, slug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/${slug}`)
  const initial = await loadStoryEditorData(slug)
  if (initial == null) notFound()
  return (
    <RouteEditPanel size="wide" label={`Edit story ${slug}`}>
      <EditorClient
        slug={slug}
        appSlug={initial.appSlug ?? appSlug}
        sectionHref={`/${appSlug}`}
        initial={initial}
        signedLinks={signStoryLinks(slug)}
      />
    </RouteEditPanel>
  )
}
