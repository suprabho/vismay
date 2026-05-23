import { redirect, notFound } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { loadStoryEditorData } from '@/lib/storyEditorData'
import { signStoryLinks } from '@/lib/signedConsumerLinks'
import EditorClient from '@/components/vizmaya/EditorClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function EditStoryPage({ params }: Props) {
  const { slug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/vizmaya/${slug}`)
  const initial = await loadStoryEditorData(slug)
  if (initial == null) notFound()
  const signedLinks = signStoryLinks(slug)
  return (
    <EditorClient
      slug={slug}
      sectionHref="/vizmaya"
      initial={initial}
      signedLinks={signedLinks}
    />
  )
}
