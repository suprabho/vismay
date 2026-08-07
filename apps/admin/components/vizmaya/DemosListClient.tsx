'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { DemoListItem } from '@vismay/content-source/demos'
import { vizmayaUrl } from '@/lib/publicSite'
import { AdminTable } from '@/components/admin'

interface Props {
  initialDemos: DemoListItem[]
}

export default function DemosListClient({ initialDemos }: Props) {
  const [demos, setDemos] = useState(initialDemos)

  const sorted = useMemo(
    () => [...demos].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [demos]
  )

  async function handleDelete(id: number, clientName: string) {
    if (!confirm(`Delete demo "${clientName}"? This cannot be undone.`)) return
    const res = await fetch(`/api/vizmaya/demos/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDemos((prev) => prev.filter((d) => d.id !== id))
    } else {
      alert('Delete failed')
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Demos</h1>
        <Link
          href="/vizmaya/demos/new"
          className="bg-white text-neutral-950 rounded-md px-4 py-2 text-sm font-medium"
        >
          New demo
        </Link>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <AdminTable
          rows={sorted}
          rowKey={(demo) => String(demo.id)}
          caption="Demos"
          empty="No demos yet. Create one to share a story with a prospect."
          columns={[
            {
              key: 'demo',
              label: 'Demo',
              render: (demo) => (
                <Link href={`/vizmaya/demos/${demo.id}`} className="block hover:text-white">
                  <div className="truncate font-medium">{demo.client_name}</div>
                  <div className="mt-0.5 truncate font-mono text-xs text-neutral-500">/demo/{demo.client_slug}</div>
                </Link>
              ),
            },
            {
              key: 'story',
              label: 'Story',
              responsive: 'secondary',
              className: 'text-neutral-400',
              render: (demo) => demo.story_slug,
            },
            {
              key: 'status',
              label: 'Status',
              className: 'w-28',
              render: (demo) => <StatusBadge status={demo.status} />,
            },
            {
              key: 'updated',
              label: 'Updated',
              responsive: 'secondary',
              className: 'w-40 text-xs text-neutral-500',
              render: (demo) => new Date(demo.updated_at).toLocaleString(),
            },
            {
              key: 'actions',
              label: 'Actions',
              sticky: true,
              className: 'w-40 text-right',
              render: (demo) => (
                <div className="flex items-center justify-end gap-3">
                  <Link href={vizmayaUrl(`/demo/${demo.client_slug}`)} target="_blank" rel="noreferrer" className="text-xs text-neutral-300 hover:text-white">
                    Open ↗
                  </Link>
                  <Link href={`/vizmaya/demos/${demo.id}`} className="text-xs text-neutral-300 hover:text-white">
                    Edit
                  </Link>
                  <button onClick={() => handleDelete(demo.id, demo.client_name)} className="text-xs text-red-400 hover:text-red-300">
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-neutral-700 text-neutral-300',
    live: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    archived: 'bg-neutral-800 text-neutral-500',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${styles[status] ?? styles.draft}`}>
      {status}
    </span>
  )
}
