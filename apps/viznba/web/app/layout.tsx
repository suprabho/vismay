import type { Metadata, Viewport } from 'next'
import { Archivo, Schibsted_Grotesk, JetBrains_Mono } from 'next/font/google'
import { AppHeader } from '@/components/AppHeader'
import { TimeZoneSync } from '@/components/TimeZoneSync'
import { getPrefs } from '@/lib/prefs'
import './globals.css'

// Archivo carries the display lines; its width axis gives the condensed cuts.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
})

const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-schibsted',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
})

const DESCRIPTION = 'NBA news, scores and schedules, read through the numbers.'

export const metadata: Metadata = {
  applicationName: 'VizNBA',
  title: { default: 'VizNBA', template: '%s · VizNBA' },
  description: DESCRIPTION,
  appleWebApp: { capable: true, title: 'VizNBA', statusBarStyle: 'black' },
  // The image itself comes from app/opengraph-image.png + twitter-image.png.
  openGraph: { type: 'website', siteName: 'VizNBA', title: 'VizNBA', description: DESCRIPTION },
  twitter: { card: 'summary_large_image', title: 'VizNBA', description: DESCRIPTION },
}

export const viewport: Viewport = {
  themeColor: '#191b1e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { tzDetected } = await getPrefs()
  return (
    <html lang="en" className={`${archivo.variable} ${schibsted.variable} ${jetbrains.variable}`}>
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
