import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { appEpicUrl } from '@/lib/publicSite'
import { listAppEpics } from '@vismay/content-source/apps'
import { AdminTable } from '@/components/admin'

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
      <AdminTable
        rows={epics}
        rowKey={(epic) => epic.slug}
        caption="Vizmaya epics"
        empty="No epics yet."
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
            key: 'preview',
            label: 'Preview',
            responsive: 'secondary',
            sticky: true,
            className: 'w-28 text-right',
            render: (epic) => {
              const previewUrl = appEpicUrl('vizmaya-fyi', epic.slug)
              return previewUrl ? (
                <Link href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-300 hover:text-white">
                  Preview ↗
                </Link>
              ) : null
            },
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
    </div>
  )
}
