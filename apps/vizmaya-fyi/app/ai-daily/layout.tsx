import type { CSSProperties } from 'react'
import { Prata, Space_Mono } from 'next/font/google'
import localFont from 'next/font/local'
import './doom-v-boom/edition.css'

// The edition's type: Prata for display, Public Sans for body, Space Mono
// for data. Loaded once for every route under /ai-daily (the hub, the Doom v
// Boom landing and every edition) and handed to the stylesheet as the
// --serif / --sans / --mono variables.
const prata = Prata({
  subsets: ['latin'],
  weight: '400',
  style: ['normal'],
  variable: '--font-prata',
  display: 'swap',
})

// Public Sans is served from a file in the repo (the latin variable font,
// SIL OFL, from @fontsource-variable/public-sans 5.3.0), not fetched from
// Google at build time: that fetch failed a Vercel build.
const publicSans = localFont({
  src: './fonts/PublicSans-latin-variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-public-sans',
  display: 'swap',
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
})

const fontVars = {
  '--serif': `var(--font-prata), Georgia, "Times New Roman", serif`,
  '--sans': `var(--font-public-sans), "Helvetica Neue", Arial, sans-serif`,
  '--mono': `var(--font-space-mono), ui-monospace, SFMono-Regular, Menlo, monospace`,
} as CSSProperties

export default function DailyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`dcd ${prata.variable} ${publicSans.variable} ${spaceMono.variable}`}
      style={fontVars}
      data-edition-root=""
    >
      {children}
    </div>
  )
}
