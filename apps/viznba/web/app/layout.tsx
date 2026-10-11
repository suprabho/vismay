import type { Metadata, Viewport } from 'next'
import { Saira, Martian_Mono } from 'next/font/google'
import { AppHeader } from '@/components/AppHeader'
import { TimeZoneSync } from '@/components/TimeZoneSync'
import { getPrefs } from '@/lib/prefs'
import './globals.css'

const saira = Saira({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-vn-sans',
})

const martian = Martian_Mono({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-vn-mono',
})

const DESCRIPTION = 'NBA news, scores and schedules, read through the numbers.'

export const metadata: Metadata = {
  // Relative canonical / OG URLs resolve against production, never a preview host.
  metadataBase: new URL('https://nba.vizmaya.fyi'),
  applicationName: 'VizNBA',
  title: { default: 'VizNBA · The NBA, read through the numbers', template: '%s · VizNBA' },
  description: DESCRIPTION,
  openGraph: { type: 'website', siteName: 'VizNBA', locale: 'en_US', description: DESCRIPTION },
  twitter: { card: 'summary_large_image' },
  alternates: { types: { 'application/rss+xml': [{ url: '/editorial/rss.xml', title: 'VizNBA Editorial' }] } },
  appleWebApp: { capable: true, title: 'VizNBA', statusBarStyle: 'black' },
}

export const viewport: Viewport = {
  themeColor: '#0b0d12',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { tzDetected } = await getPrefs()
  return (
    <html lang="en" className={`${saira.variable} ${martian.variable}`}>
      <body className="min-h-dvh bg-bg font-sans text-text antialiased">
        <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
          <AppHeader />
          {children}
        </div>
        <TimeZoneSync known={tzDetected} />
      </body>
    </html>
  )
}
