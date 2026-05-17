import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listAppsWithCounts } from '@/lib/apps'

export const dynamic = 'force-dynamic'

export default async function AdminAppsListPage() {
  if (!(await isAuthed())) redirect('/admin/login?next=/admin/apps')
  const apps = await listAppsWithCounts()

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-5 border-b border-white/5">
        <h1 className="text-lg font-semibold">Apps</h1>
        <p className="text-sm text-neutral-400 mt-0.5">{apps.length} total</p>
      </div>
      <ul className="divide-y divide-white/5">
        {apps.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/admin/apps/${a.slug}`}
              className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-white/2.5 transition-colors"
            >
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="font-medium truncate">{a.name}</div>
                <div className="text-xs text-neutral-500 truncate mt-0.5">{a.slug}</div>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-sm text-neutral-400 tabular-nums">
                <div>
                  <span className="text-neutral-200">{a.epicCount}</span>{' '}
                  <span className="text-neutral-500">epic{a.epicCount === 1 ? '' : 's'}</span>
                </div>
                <div>
                  <span className="text-neutral-200">{a.storyCount}</span>{' '}
                  <span className="text-neutral-500">{a.storyCount === 1 ? 'story' : 'stories'}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
