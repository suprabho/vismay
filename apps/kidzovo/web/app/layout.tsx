import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kidzovo',
  description: 'Kids stories, told as scrollytelling panels.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-story `theme:` blocks drive the visible palette via `<ThemeProvider>`
  // inside each story page. The root layout stays palette-agnostic so the
  // landing page can use its own neutral defaults.
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  )
}
