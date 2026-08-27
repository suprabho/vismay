import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Fraunces } from 'next/font/google'
import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
})

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  axes: ['SOFT', 'opsz'],
})

// Brand-neutral render surface host. No brand metadata / analytics / JSON-LD —
// these routes are signed, headless render targets, never indexed.
export const metadata: Metadata = {
  title: 'Render',
  robots: { index: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Extend content under the iOS notch / Dynamic Island so the dark hero and
  // aura backdrop reach the physical screen edges rather than being letterboxed
  // by the default safe-area gutters.
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable} antialiased`}>
      <body>{children}</body>
    </html>
  )
}
