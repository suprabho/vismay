import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import DcRecapsClient from './DcRecapsClient'

export const dynamic = 'force-dynamic'

export default async function DcRecapsPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/dc-recaps')
  return <DcRecapsClient />
}
