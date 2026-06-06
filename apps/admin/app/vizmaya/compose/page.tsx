import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { ComposePanel } from '@/components/vizmaya/compose/ComposePanel'

export const dynamic = 'force-dynamic'

export default async function ComposePage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/compose')
  return <ComposePanel />
}
