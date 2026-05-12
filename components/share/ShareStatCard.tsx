'use client'

import type { StatColor } from '@/lib/storyConfig.types'
import { statColorVar } from '@/components/story/ThemeProvider'

interface Props {
  value: string
  subheading?: string
  description: string
  color?: StatColor
}

export default function ShareStatCard({ value, subheading, description, color: colorToken }: Props) {
  const color = statColorVar(colorToken)

  return (
    <div className="flex flex-col items-center justify-center text-center h-full px-10 pt-12 pb-8">
      <div
        className="font-[family-name:var(--font-serif)] text-[5.5rem] font-bold leading-none mb-4"
        style={{ color }}
      >
        {value}
      </div>
      {subheading && (
        <div
          className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.15em] mb-3"
          style={{ color: 'var(--color-accent)' }}
        >
          {subheading}
        </div>
      )}
      <div
        className="font-[family-name:var(--font-sans)] text-[0.95rem] max-w-[440px] leading-[1.55]"
        style={{ color: 'var(--color-muted)' }}
      >
        {description}
      </div>
    </div>
  )
}
