import Link from 'next/link'
import { LandingPage } from '@/components/landing/LandingPage'
import { isAuthed } from '@/lib/adminAuth'
import { listUnassignedStories } from '@vismay/content-source/apps'
import DraftsList from '@/components/vizmaya/DraftsList'

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
        <ul className="grid gap-3">
          {APPS.map((app) => (
            <AppCard key={app.href} app={app} />
          ))}
        </ul>
        <DraftsList stories={drafts} />
      </div>
    </div>
  )
}

function AppCard({ app }: { app: AppEntry }) {
  const disabled = app.status === 'coming-soon'
  const baseClass =
    'block rounded-lg border border-white/10 bg-white/5 p-4 transition-colors'
  const hoverClass = disabled
    ? 'cursor-not-allowed opacity-60'
    : 'hover:bg-white/10 hover:border-white/20'

  const body = (
    <div className="flex items-baseline justify-between gap-4">
      <div className="space-y-1 min-w-0">
        <div className="font-medium">{app.name}</div>
        <div className="text-sm text-neutral-400">{app.description}</div>
      </div>
      {disabled && (
        <span className="shrink-0 text-xs uppercase tracking-wider text-neutral-500">
          coming soon
        </span>
      )}
    </div>
  )

  if (disabled) {
    return (
      <li>
        <div className={`${baseClass} ${hoverClass}`}>{body}</div>
      </li>
    )
  }

  return (
    <li>
      <Link href={app.href} className={`${baseClass} ${hoverClass}`}>
        {body}
      </Link>
    </li>
  )
}
