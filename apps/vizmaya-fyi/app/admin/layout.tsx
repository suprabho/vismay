import Link from 'next/link'
import { isAuthed, expectedToken } from '@/lib/adminAuth'
import LogoutButton from '@/components/admin/LogoutButton'
import { AdminTabs } from '@/components/admin/AdminTabs'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const configured = expectedToken() !== null
  const authed = await isAuthed()

  return (
    <div className="admin-root h-svh bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      <header
        className="shrink-0 flex items-center justify-between gap-3 border-b border-white/10 bg-neutral-950/90 backdrop-blur px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]"
      >
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/admin" className="font-medium tracking-tight">
            admin
          </Link>
          {authed && configured && <AdminTabs />}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/"
            className="text-neutral-400 hover:text-white transition-colors"
          >
            view site
          </Link>
          {authed && <LogoutButton />}
        </div>
      </header>
      <main className="flex-1 min-h-0 flex flex-col">
        {configured ? children : <NotConfigured />}
      </main>
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold">Admin not configured</h1>
        <p className="text-neutral-400 text-sm">
          Set <code className="bg-white/10 px-1 py-0.5 rounded">ADMIN_PASSWORD</code>
          {' '}in your environment to enable the editor. Optionally also set{' '}
          <code className="bg-white/10 px-1 py-0.5 rounded">ADMIN_SESSION_SECRET</code>
          {' '}to rotate sessions independently.
        </p>
      </div>
    </div>
  )
}
