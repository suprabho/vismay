import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import StoriesListClient from '@/components/section/StoriesListClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string }>
}

// Per-app Stories tab (footshorts, vizf1, storytime-ovo, …). Renders the same
// rich list as Vizmaya, scoped to this app: the list filters by `appSlug` and
// uploads are tagged to it. The owning app's existence is validated in the
// section layout (getApp → notFound); auth is enforced by middleware, with this
// redirect as a lightweight backstop.
export default async function AppStoriesListPage({ params }: Props) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}`)
  return <StoriesListClient appSlug={appSlug} basePath={`/${appSlug}`} />
}
