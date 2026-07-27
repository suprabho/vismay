import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Searching for Umami',
  description:
    'A field guide to Asian cuisines, dish by dish — the top-rated foods of India, China, Thailand, Indonesia and Japan.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-umami-bg text-umami-text">{children}</body>
    </html>
  )
}
