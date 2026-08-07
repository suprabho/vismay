import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { appEpicUrl } from '@/lib/publicSite'
import { listAppEpics } from '@vismay/content-source/apps'
import { AdminTable } from '@/components/admin'

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
        <AdminTable
          rows={epics}
          rowKey={(epic) => epic.slug}
          caption={`${appSlug} epics`}
          empty="No epics tagged with this app yet."
          columns={[
            {
              key: 'epic',
              label: 'Epic',
              render: (epic) => (
                <Link href={`/${appSlug}/epics/${epic.slug}`} className="block hover:text-white">
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
              className: 'w-28 text-right',
              render: (epic) => {
                const previewUrl = appEpicUrl(appSlug, epic.slug)
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
                <Link href={`/${appSlug}/epics/${epic.slug}`} className="text-xs text-neutral-300 hover:text-white">
                  Edit
                </Link>
              ),
            },
          ]}
        />
      )}
    </div>
  )
}
