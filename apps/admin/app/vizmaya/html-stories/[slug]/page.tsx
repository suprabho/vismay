import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { vizmayaPublicUrl } from '@/lib/publicSite'
import HtmlStoryEditorClient from './HtmlStoryEditorClient'

export const dynamic = 'force-dynamic'

export default async function HtmlStoryAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/vizmaya/html-stories/${slug}`)
  return <HtmlStoryEditorClient slug={slug} create={false} siteUrl={vizmayaPublicUrl} />
}
