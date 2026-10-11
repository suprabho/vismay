import type { Metadata, Viewport } from 'next'
import { Saira, Martian_Mono } from 'next/font/google'
import { ThemeProvider } from '@/lib/ThemeProvider'
import { QueryProvider } from '@/lib/QueryProvider'
import { AuthProvider } from '@/lib/AuthProvider'
import { AuthModalProvider } from '@/lib/AuthModalProvider'
import './globals.css'

const saira = Saira({
  subsets: ['latin'],
  axes: ['wdth'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-vf-sans',
})

const martian = Martian_Mono({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-vf-mono',
})

const SITE_URL = 'https://www.vizf1.com'
const DESCRIPTION =
  'Formula 1 data journalism: race recaps, strategy, telemetry and driver and team stories, told in charts.'

export const metadata: Metadata = {
  // www is canonical (the apex redirects): relative OG/canonical URLs resolve here.
  metadataBase: new URL(SITE_URL),
  applicationName: 'VizF1',
  title: { default: 'VizF1 · Formula 1, told in data', template: '%s · VizF1' },
  description: DESCRIPTION,
  openGraph: { type: 'website', siteName: 'VizF1', locale: 'en_US', description: DESCRIPTION },
  twitter: { card: 'summary_large_image' },
  alternates: { types: { 'application/rss+xml': [{ url: '/editorial/rss.xml', title: 'VizF1 Editorial' }] } },
  // iOS has no manifest-driven install — these drive "Add to Home Screen":
  // launch fullscreen (standalone), the home-screen label, and a dark status bar.
  appleWebApp: {
    capable: true,
    title: 'VizF1',
    statusBarStyle: 'black',
  },
  // Next emits the standardized `mobile-web-app-capable` for `capable: true`;
  // also emit the legacy apple name so iOS < 16.4 (which ignores the manifest's
  // display:standalone) still launches fullscreen from the home screen.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
}

// themeColor sets the mobile browser chrome / standalone status-bar colour.
// Matches the dark app background (--color-bg) for a seamless top bar.
export const viewport: Viewport = {
  themeColor: '#0b0d12',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${saira.variable} ${martian.variable}`}>
      <body className="bg-bg text-text antialiased min-h-screen">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <AuthModalProvider>{children}</AuthModalProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
