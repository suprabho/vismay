import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { SocialInbox } from '@/components/admin/social/SocialInbox'

export const dynamic = 'force-dynamic'

export default async function SocialMonitorPage() {
  if (!(await isAuthed())) redirect('/admin/login?next=/admin/social/monitor')
  return <SocialInbox />
}
