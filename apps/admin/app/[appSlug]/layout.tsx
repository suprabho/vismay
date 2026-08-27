import { notFound, redirect } from 'next/navigation'
import { isAuthed, isConfigured } from '@/lib/adminAuth'
import { getApp } from '@vismay/content-source/apps'
import { APP_BY_SLUG } from '@vismay/verticals/data'
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

  const configured = isConfigured()
  const authed = await isAuthed()
  const showTabs = authed && configured

  // Per-app brand mark from the static registry (currentColor SVG string).
  // Generic: any app that sets `branding.logoSvg` gets one — vizf1 today.
  const logoSvg = APP_BY_SLUG.get(appSlug)?.branding.logoSvg

  return (
    <>
      {showTabs && (
        <div data-app-tabs className="shrink-0 border-b border-white/10 bg-neutral-950/60 backdrop-blur px-4 py-2 flex items-center gap-3 text-sm">
          <span className="shrink-0 flex items-center gap-2 whitespace-nowrap text-neutral-500 text-xs uppercase tracking-wider">
            {logoSvg && (
              <span
                aria-hidden
                className="shrink-0 text-neutral-400 [&>svg]:h-4 [&>svg]:w-auto"
                dangerouslySetInnerHTML={{ __html: logoSvg }}
              />
            )}
            {app.name}
          </span>
          <AppAdminTabs appSlug={appSlug} />
        </div>
      )}
      {children}
    </>
  )
}
