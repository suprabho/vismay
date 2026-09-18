import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { CupFixturesClient } from '@/components/footshorts/CupFixturesClient'

export const dynamic = 'force-dynamic'

export default async function CupFixturesPage({ params }: { params: Promise<{ appSlug: string }> }) {
  const { appSlug } = await params
  if (appSlug !== 'footshorts') notFound()
  if (!(await isAuthed())) redirect('/login?next=/footshorts/cup-fixtures')
  return <CupFixturesClient />
}
