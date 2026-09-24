import type { CSSProperties } from 'react'
import { Prata, Public_Sans, Space_Mono } from 'next/font/google'
import './edition.css'

// The edition's type: Prata for display, Public Sans for body, Space Mono
// for data. Loaded once for every route under /ai-daily/doom-v-boom and
// handed to the stylesheet as the --serif / --sans / --mono variables.
const prata = Prata({
  subsets: ['latin'],
  weight: '400',
  style: ['normal'],
  variable: '--font-prata',
  display: 'swap',
})

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
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
