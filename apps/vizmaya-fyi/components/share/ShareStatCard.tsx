'use client'

import type { StatColor } from '@vismay/viz-engine'
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
    <div className="flex flex-col items-center justify-center text-center h-full px-[40px] pt-[60px] pb-[40px]">
      <div
        className="font-[family-name:var(--font-serif)] text-[50px] font-bold leading-none mb-[20px]"
        style={{ color }}
      >
        {value}
      </div>
      {subheading && (
        <div
          className="font-[family-name:var(--font-mono)] text-[13px] uppercase tracking-[0.15em] mb-[15px]"
          style={{ color: 'var(--color-accent)' }}
        >
          {subheading}
        </div>
      )}
      <div
        className="font-[family-name:var(--font-sans)] text-[16px] leading-[1.55]"
        style={{ color: 'var(--color-muted)' }}
      >
        {description}
      </div>
    </div>
  )
}
