import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listDemos } from '@/lib/demos'
import DemosListClient from '@/components/vizmaya/DemosListClient'

export const dynamic = 'force-dynamic'

export default async function AdminDemosPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/demos')
  const demos = await listDemos()
  return <DemosListClient initialDemos={demos} />
}
