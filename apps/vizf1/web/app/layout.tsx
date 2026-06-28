import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/lib/ThemeProvider'
import { QueryProvider } from '@/lib/QueryProvider'
import { AuthProvider } from '@/lib/AuthProvider'

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
    <html lang="en" className="dark">
      <body className="bg-bg text-text antialiased min-h-screen">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>{children}</AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
