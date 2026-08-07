import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getApp, listAppEpics, listAppStories } from '@vismay/content-source/apps'
import { AdminTable } from '@/components/admin'

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
          <AdminTable
            rows={epics}
            rowKey={(epic) => epic.slug}
            caption={`${app.name} epics`}
            empty="No epics in this app."
            columns={[
              {
                key: 'epic',
                label: 'Epic',
                render: (epic) => (
                  <Link href={`/vizmaya/epics/${epic.slug}`} className="block hover:text-white">
                    <div className="truncate font-medium">{epic.name}</div>
                    <div className="mt-0.5 truncate font-mono text-xs text-neutral-500">{epic.slug}</div>
                  </Link>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                className: 'w-32 text-neutral-400',
                render: (epic) => epic.status,
              },
              {
                key: 'action',
                label: 'Action',
                sticky: true,
                className: 'w-20 text-right',
                render: (epic) => (
                  <Link href={`/vizmaya/epics/${epic.slug}`} className="text-xs text-neutral-300 hover:text-white">
                    Edit
                  </Link>
                ),
              },
            ]}
          />
        )}
      </section>

      <section>
        <div className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">
          Stories ({stories.length})
        </div>
        {stories.length === 0 ? (
          <div className="px-4 py-4 text-sm text-neutral-500">No stories in this app.</div>
        ) : (
          <AdminTable
            rows={stories}
            rowKey={(story) => story.slug}
            caption={`${app.name} stories`}
            empty="No stories in this app."
            columns={[
              {
                key: 'story',
                label: 'Story',
                render: (story) => (
                  <Link href={`/vizmaya/${story.slug}`} className="block hover:text-white">
                    <div className="truncate font-medium">{story.title}</div>
                    <div className="mt-0.5 truncate font-mono text-xs text-neutral-500">{story.slug}</div>
                  </Link>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                className: 'w-32 text-neutral-400',
                render: (story) => story.status,
              },
              {
                key: 'action',
                label: 'Action',
                sticky: true,
                className: 'w-20 text-right',
                render: (story) => (
                  <Link href={`/vizmaya/${story.slug}`} className="text-xs text-neutral-300 hover:text-white">
                    Edit
                  </Link>
                ),
              },
            ]}
          />
        )}
      </section>
    </div>
  )
}
