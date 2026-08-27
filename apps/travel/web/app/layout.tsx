import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trips',
  description: 'Travel journeys, shared with friends and family.',
  // Every trip is password-gated; keep the whole app out of search indexes.
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-story `theme:` blocks drive the visible palette via `<ThemeProvider>`
  // inside each story page. The root layout stays palette-agnostic so the
  // landing and login pages can use their own neutral defaults.
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  )
}
