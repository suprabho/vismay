import { notFound, redirect } from 'next/navigation'
import { isAuthed, expectedToken } from '@/lib/adminAuth'
import { getApp } from '@vismay/content-source/apps'
import { AppAdminTabs } from '@/components/section/AppAdminTabs'

export const dynamic = 'force-dynamic'

/**
 * Vizmaya-fyi keeps its own static /vizmaya/* tree because it has demos and
 * social tabs the dynamic section doesn't cover. Anyone hitting
 * /vizmaya-fyi here gets bounced to the canonical /vizmaya URL.
 */
const VIZMAYA_APP_SLUG = 'vizmaya-fyi'

export default async function AppSectionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ appSlug: string }>
}) {
  const { appSlug } = await params

  if (appSlug === VIZMAYA_APP_SLUG) {
    redirect('/vizmaya')
  }

  const app = await getApp(appSlug)
  if (!app) notFound()

  const configured = expectedToken() !== null
  const authed = await isAuthed()
  const showTabs = authed && configured

  return (
    <>
      {showTabs && (
        <div className="shrink-0 border-b border-white/10 bg-neutral-950/60 backdrop-blur px-4 py-2 flex items-center gap-3 text-sm">
          <span className="text-neutral-500 text-xs uppercase tracking-wider">
            {app.name}
          </span>
          <AppAdminTabs appSlug={appSlug} />
        </div>
      )}
      {children}
    </>
  )
}
