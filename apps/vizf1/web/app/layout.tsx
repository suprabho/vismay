import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VizF1',
  description: 'Data journalism for Formula 1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
