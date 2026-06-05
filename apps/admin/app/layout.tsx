import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import { LogoutButton } from '@vismay/admin-core'
import { isAuthed, isConfigured } from '@/lib/adminAuth'
import AssistantLauncher from '@/components/AssistantLauncher'
import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Vismay admin',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const configured = isConfigured()
  const authed = await isAuthed()
  const siteUrl = process.env.NEXT_PUBLIC_VIZMAYA_URL || 'https://vizmaya.fyi'

  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body>
        <div className="admin-root h-svh bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
          <header className="shrink-0 flex items-center justify-between gap-3 border-b border-white/10 bg-neutral-950/90 backdrop-blur px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
            <div className="flex items-center gap-4 min-w-0">
              <Link href="/" className="font-medium tracking-tight">
                admin
              </Link>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <a
                href={siteUrl}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-400 hover:text-white transition-colors"
              >
                view site
              </a>
              {authed && (
                <Link
                  href="/vizmaya/ai-models"
                  className="text-neutral-400 hover:text-white transition-colors"
                >
                  AI models
                </Link>
              )}
              {authed && <AssistantLauncher />}
              {authed && (
                <LogoutButton logoutEndpoint="/api/logout" />
              )}
            </div>
          </header>
          <main className="flex-1 min-h-0 flex flex-col">
            {configured ? children : <NotConfigured />}
          </main>
        </div>
      </body>
    </html>
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
