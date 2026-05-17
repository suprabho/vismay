'use client'

import { useRef } from 'react'
import { useInView } from '@/lib/use-in-view'
import { StatBlock as StatBlockType } from '@/types/story'

export default function StatBlock({ block }: { block: StatBlockType }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { threshold: 0.3 })

  const isPercentage = block.value.includes('%')
  const color = isPercentage ? 'var(--color-red, #E24B4A)' : 'var(--color-accent2)'

  return (
    <section
      ref={ref}
      className="flex flex-col items-center justify-center min-h-[50vh] px-8 py-16 text-center"
    >
      <div
        className="font-[family-name:var(--font-serif)] text-[clamp(3.5rem,12vw,8rem)] font-bold leading-none mb-2 transition-all duration-700"
        style={{
          color,
          opacity: isInView ? 1 : 0,
          transform: isInView ? 'translateY(0)' : 'translateY(20px)',
        }}
      >
        {block.value}
      </div>
      <div
        className="font-[family-name:var(--font-sans)] text-base max-w-[440px] leading-[1.55] transition-all duration-700 delay-200"
        style={{
          color: 'var(--color-muted)',
          opacity: isInView ? 1 : 0,
          transform: isInView ? 'translateY(0)' : 'translateY(10px)',
        }}
      >
        {block.description}
      </div>
    </section>
  )
}
