import { isAuthed, expectedToken } from '@/lib/adminAuth'
import { AdminTabs } from '@/components/vizmaya/AdminTabs'

export const dynamic = 'force-dynamic'

export default async function VizmayaLayout({ children }: { children: React.ReactNode }) {
  const configured = expectedToken() !== null
  const authed = await isAuthed()
  const showTabs = authed && configured
  return (
    <>
      {showTabs && (
        <div className="shrink-0 border-b border-white/10 bg-neutral-950/60 backdrop-blur px-4 py-2 flex items-center gap-3 text-sm">
          <span className="text-neutral-500 text-xs uppercase tracking-wider">Vizmaya FYI</span>
          <AdminTabs />
        </div>
      )}
      {children}
    </>
  )
}
