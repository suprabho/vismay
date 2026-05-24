import { redirect, notFound } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { loadStoryEditorData } from '@/lib/storyEditorData'
import { signStoryLinks } from '@/lib/signedConsumerLinks'
import EditorClient from '@/components/vizmaya/EditorClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string; slug: string }>
}

export default async function AppEditStoryPage({ params }: Props) {
  const { appSlug, slug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/${slug}`)
  const initial = await loadStoryEditorData(slug)
  if (initial == null) notFound()
  const signedLinks = signStoryLinks(slug)
  return (
    <EditorClient
      slug={slug}
      appSlug={appSlug}
      sectionHref={`/${appSlug}`}
      initial={initial}
      signedLinks={signedLinks}
    />
  )
}
