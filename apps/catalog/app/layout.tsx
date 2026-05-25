import type { Metadata } from 'next'
import './globals.css'
import { loadVertical, registerVerticalLoader } from '@vismay/viz-engine'

registerVerticalLoader('f1', () => import('@vismay/f1-viz').then((m) => m.register()))
registerVerticalLoader('footshorts', () =>
  import('@vismay/footshorts-viz').then((m) => m.register()),
)

export const metadata: Metadata = {
  title: 'Vismay catalog',
  description: 'Browse every registered VizModule with live preview + adminForm schema',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await Promise.all([loadVertical('f1'), loadVertical('footshorts')])
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-text antialiased min-h-screen">{children}</body>
    </html>
  )
}
