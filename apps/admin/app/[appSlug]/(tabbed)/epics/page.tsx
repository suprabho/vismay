import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listAppEpics } from '@vismay/content-source/apps'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string }>
}

export default async function AppEpicsListPage({ params }: Props) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/epics`)
  const epics = await listAppEpics(appSlug)

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="px-4 py-5 border-b border-white/5 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Epics</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            {epics.length} total · app <code className="font-mono">{appSlug}</code>
          </p>
        </div>
      </div>
      {epics.length === 0 ? (
        <div className="px-4 py-10 text-sm text-neutral-500 text-center">
          No epics tagged with this app yet.
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {epics.map((e) => (
            <li key={e.slug}>
              <div className="flex items-center justify-between gap-3 hover:bg-white/[0.025] transition-colors">
                <Link
                  href={`/${appSlug}/epics/${e.slug}`}
                  className="flex-1 min-w-0 flex flex-col px-4 py-4"
                >
                  <div className="font-medium truncate">{e.name}</div>
                  <div className="text-xs text-neutral-500 mt-0.5 font-mono truncate">
                    {e.slug}
                  </div>
                </Link>
                <span className="shrink-0 text-xs uppercase tracking-wider text-neutral-500">
                  {e.status}
                </span>
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
      )}
    </div>
  )
}
