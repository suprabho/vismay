import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getApp, listAppEpics, listAppStories } from '@/lib/apps'

export const dynamic = 'force-dynamic'

export default async function AdminAppDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/vizmaya/apps/${slug}`)

  const app = await getApp(slug)
  if (!app) notFound()

  const [epics, stories] = await Promise.all([listAppEpics(slug), listAppStories(slug)])

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-5 border-b border-white/5 flex items-center justify-between gap-3">
        <div>
          <Link
            href="/vizmaya/apps"
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            ← Apps
          </Link>
          <h1 className="text-lg font-semibold mt-1">{app.name}</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            {app.slug} · {app.status}
          </p>
        </div>
      </div>

      <section className="border-b border-white/5">
        <div className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">
          Epics ({epics.length})
        </div>
        {epics.length === 0 ? (
          <div className="px-4 py-4 text-sm text-neutral-500">No epics in this app.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {epics.map((e) => (
              <li key={e.slug}>
                <Link
                  href={`/vizmaya/epics/${e.slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/2.5 transition-colors"
                >
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="font-medium truncate">{e.name}</div>
                    <div className="text-xs text-neutral-500 truncate mt-0.5">{e.slug}</div>
                  </div>
                  <div className="text-xs text-neutral-500 shrink-0">{e.status}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">
          Stories ({stories.length})
        </div>
        {stories.length === 0 ? (
          <div className="px-4 py-4 text-sm text-neutral-500">No stories in this app.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {stories.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/vizmaya/${s.slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/2.5 transition-colors"
                >
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="font-medium truncate">{s.title}</div>
                    <div className="text-xs text-neutral-500 truncate mt-0.5">{s.slug}</div>
                  </div>
                  <div className="text-xs text-neutral-500 shrink-0">{s.status}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
