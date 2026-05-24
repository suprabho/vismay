import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listAppEpics } from '@vismay/content-source/apps'

export const dynamic = 'force-dynamic'

export default async function AdminEpicsListPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/epics')
  // vizf1 and footshorts epics now live in their own /<appSlug>/epics
  // sections — scope vizmaya admin to its own app.
  const epics = await listAppEpics('vizmaya-fyi')

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-5 border-b border-white/5">
        <h1 className="text-lg font-semibold">Epics</h1>
        <p className="text-sm text-neutral-400 mt-0.5">{epics.length} total</p>
      </div>
      <ul className="divide-y divide-white/5">
        {epics.map((e) => (
          <li key={e.slug}>
            <div className="flex items-center justify-between gap-3 hover:bg-white/[0.025] transition-colors">
              <Link
                href={`/vizmaya/epics/${e.slug}`}
                className="flex-1 min-w-0 flex flex-col px-4 py-4"
              >
                <div className="font-medium truncate">{e.name}</div>
                <div className="text-xs text-neutral-500 truncate mt-0.5">{e.slug}</div>
              </Link>
              <Link
                href={`https://vizmaya.fyi/epic/${e.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-neutral-300 hover:text-white px-3 py-1.5 mr-4 border border-white/10 rounded-lg hover:bg-white/5 shrink-0"
              >
                preview →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
