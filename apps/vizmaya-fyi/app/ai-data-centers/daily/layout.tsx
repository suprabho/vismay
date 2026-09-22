import type { CSSProperties } from 'react'
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from 'next/font/google'
import './edition.css'

// The edition's type: Newsreader for display, IBM Plex Sans / Mono for body
// and data. Loaded once for every route under /ai-data-centers/daily and
// handed to the stylesheet as the --serif / --sans / --mono variables.
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: 'variable',
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-newsreader',
  display: 'swap',
})

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

const fontVars = {
  '--serif': `var(--font-newsreader), Georgia, "Times New Roman", serif`,
  '--sans': `var(--font-plex-sans), "Helvetica Neue", Arial, sans-serif`,
  '--mono': `var(--font-plex-mono), ui-monospace, SFMono-Regular, Menlo, monospace`,
} as CSSProperties

export default function DailyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`dcd ${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}
      style={fontVars}
      data-edition-root=""
    >
      {children}
    </div>
  )
}
