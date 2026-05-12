import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listEpics } from '@/lib/epics'
import { getThemeMeta } from '@/app/admin/epics/themeRegistry.server'

export const dynamic = 'force-dynamic'

export default async function AdminEpicsListPage() {
  if (!(await isAuthed())) redirect('/admin/login?next=/admin/epics')
  const epics = await listEpics()

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-5 border-b border-white/5">
        <h1 className="text-lg font-semibold">Epics</h1>
        <p className="text-sm text-neutral-400 mt-0.5">{epics.length} total</p>
      </div>
      <ul className="divide-y divide-white/5">
        {epics.map((e) => {
          const hasTheme = getThemeMeta(e.slug) !== null
          return (
            <li key={e.slug}>
              <div className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-white/2.5 transition-colors">
                <Link
                  href={`/${e.slug}`}
                  target="_blank"
                  className="flex-1 min-w-0 flex flex-col"
                >
                  <div className="font-medium truncate">{e.name}</div>
                  <div className="text-xs text-neutral-500 truncate mt-0.5">{e.slug}</div>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {hasTheme ? (
                    <Link
                      href={`/admin/epics/${e.slug}`}
                      className="text-sm text-neutral-300 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
                    >
                      edit theme →
                    </Link>
                  ) : (
                    <span className="text-xs text-neutral-600 px-3 py-1.5">no theme registered</span>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
