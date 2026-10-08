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

export const metadata: Metadata = {
  applicationName: 'VizNBA',
  title: { default: 'VizNBA', template: '%s · VizNBA' },
  description: 'NBA news, scores and schedules, read through the numbers.',
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
