import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { SocialInbox } from '@/components/vizmaya/social/SocialInbox'

export const dynamic = 'force-dynamic'

export default async function SocialMonitorPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/social/monitor')
  return <SocialInbox />
}
