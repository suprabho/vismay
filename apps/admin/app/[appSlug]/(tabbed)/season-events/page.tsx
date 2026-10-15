import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { SeasonEventsClient } from '@/components/footshorts/SeasonEventsClient'

export const dynamic = 'force-dynamic'

export default async function SeasonEventsPage({ params }: { params: Promise<{ appSlug: string }> }) {
  const { appSlug } = await params
  if (appSlug !== 'footshorts') notFound()
  if (!(await isAuthed())) redirect('/login?next=/footshorts/season-events')
  return <SeasonEventsClient />
}
