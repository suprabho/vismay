import type { Metadata } from 'next'
import './globals.css'
import { loadVertical } from '@vismay/viz-engine'
import { registerAllVerticals, VERTICALS } from '@vismay/verticals'

// Every vertical from the shared registry — see verticalRegistry.ts.
registerAllVerticals()

export const metadata: Metadata = {
  title: 'Vismay catalog',
  description: 'Browse every registered VizModule with live preview + adminForm schema',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await Promise.all(VERTICALS.map((v) => loadVertical(v.slug)))
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-text antialiased min-h-screen">{children}</body>
    </html>
  )
}
