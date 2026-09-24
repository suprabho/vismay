import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import EditionsClient from './EditionsClient'

export const dynamic = 'force-dynamic'

// The AI Data Centers daily snapshot's review desk: the draft between the
// 06:15 UTC composer run and the 09:00 UTC freeze, editable in place, plus
// the read-only archive.
export default async function EditionsPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/editions')
  return <EditionsClient />
}
