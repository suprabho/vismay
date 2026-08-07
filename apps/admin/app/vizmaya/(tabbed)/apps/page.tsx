import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listAppsWithCounts } from '@vismay/content-source/apps'
import { AdminTable } from '@/components/admin'

export const dynamic = 'force-dynamic'

export default async function AdminAppsListPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/apps')
  const apps = await listAppsWithCounts()

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-5 border-b border-white/5">
        <h1 className="text-lg font-semibold">Apps</h1>
        <p className="text-sm text-neutral-400 mt-0.5">{apps.length} total</p>
      </div>
      <AdminTable
        rows={apps}
        rowKey={(app) => app.slug}
        caption="Vismay apps"
        empty="No apps configured."
        columns={[
          {
            key: 'app',
            label: 'App',
            render: (app) => (
              <Link href={`/vizmaya/apps/${app.slug}`} className="block hover:text-white">
                <div className="truncate font-medium">{app.name}</div>
                <div className="mt-0.5 truncate font-mono text-xs text-neutral-500">{app.slug}</div>
              </Link>
            ),
          },
          {
            key: 'epics',
            label: 'Epics',
            responsive: 'secondary',
            className: 'w-28 tabular-nums text-neutral-300',
            render: (app) => app.epicCount,
          },
          {
            key: 'stories',
            label: 'Stories',
            responsive: 'secondary',
            className: 'w-28 tabular-nums text-neutral-300',
            render: (app) => app.storyCount,
          },
          {
            key: 'action',
            label: 'Open',
            sticky: true,
            className: 'w-24 text-right',
            render: (app) => (
              <Link href={`/vizmaya/apps/${app.slug}`} className="text-xs text-neutral-300 hover:text-white">
                Details →
              </Link>
            ),
          },
        ]}
      />
    </div>
  )
}
