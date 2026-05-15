import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { SocialInbox } from './SocialInbox'

export const dynamic = 'force-dynamic'

export default async function AdminSocialPage() {
  if (!(await isAuthed())) redirect('/admin/login?next=/admin/social')
  return <SocialInbox />
}
