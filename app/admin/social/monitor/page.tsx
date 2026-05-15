import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export default async function SocialMonitorPage() {
  if (!(await isAuthed())) redirect('/admin/login?next=/admin/social/monitor')
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-2">
        <h2 className="text-base font-semibold">Monitor</h2>
        <p className="text-sm text-neutral-400">
          Engagement inbox — comments, mentions, replies across X, LinkedIn, YouTube.
          Coming soon.
        </p>
      </div>
    </div>
  )
}
