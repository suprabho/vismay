import Link from 'next/link'
import { LandingPage } from '@/components/landing/LandingPage'
import { isAuthed } from '@/lib/adminAuth'
import { listUnassignedStories } from '@vismay/content-source/apps'
import DraftsList from '@/components/vizmaya/DraftsList'
import { AdminTable } from '@/components/admin'

interface AppEntry {
  href: string
  name: string
  description: string
  status: 'available' | 'coming-soon'
}

const APPS: AppEntry[] = [
  {
    href: '/vizmaya',
    name: 'Vizmaya FYI',
    description: 'Stories, epics, demos, charts, social, narration.',
    status: 'available',
  },
  {
    href: '/vizf1',
    name: 'VizF1',
    description: 'F1 stories and epics tagged to the vizf1 app.',
    status: 'available',
  },
  {
    href: '/footshorts',
    name: 'Footshorts',
    description: 'Football stories and epics tagged to the footshorts app.',
    status: 'available',
  },
  {
    href: '/storytime-ovo',
    name: 'Storytime with Ovo',
    description: 'Stories and epics tagged to the storytime-ovo app.',
    status: 'available',
  },
  {
    href: '/experiments',
    name: 'Experiments',
    description: 'Experimental stories and epics.',
    status: 'available',
  },
]

export default async function HomePage() {
  const authed = await isAuthed()
  if (!authed) return <LandingPage />
  return <Dashboard />
}

async function Dashboard() {
  // Unassigned stories (db mode only; fs mode is single-app and returns []).
  const drafts = await listUnassignedStories().catch(() => [])
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Vismay admin</h1>
          <p className="text-sm text-neutral-400">
            Central panel for managing content across Vismay apps.
          </p>
        </div>
        <AdminTable
          rows={APPS}
          rowKey={(app) => app.href}
          caption="Vismay applications"
          empty="No applications configured."
          columns={[
            {
              key: 'name',
              label: 'Application',
              render: (app) => {
                const disabled = app.status === 'coming-soon'
                return disabled ? (
                  <div className="space-y-1 opacity-60">
                    <div className="font-medium">{app.name}</div>
                    <div className="text-xs text-neutral-400">{app.description}</div>
                  </div>
                ) : (
                  <Link href={app.href} className="block space-y-1 hover:text-white">
                    <div className="font-medium">{app.name}</div>
                    <div className="text-xs text-neutral-400">{app.description}</div>
                  </Link>
                )
              },
            },
            {
              key: 'status',
              label: 'Status',
              className: 'w-36 text-right',
              render: (app) => (
                <span className={`text-xs uppercase tracking-wider ${app.status === 'available' ? 'text-emerald-400' : 'text-neutral-500'}`}>
                  {app.status === 'available' ? 'available' : 'coming soon'}
                </span>
              ),
            },
          ]}
        />
        <DraftsList stories={drafts} />
      </div>
    </div>
  )
}
