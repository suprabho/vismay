'use client'

import { useRef } from 'react'
import { useInView } from '@/lib/use-in-view'
import { ExposureGridBlock } from '@/types/story'

const COLORS = ['var(--color-accent)', 'var(--color-amber, #EF9F27)', 'var(--color-red, #E24B4A)']

export default function ExposureGrid({ block }: { block: ExposureGridBlock }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { threshold: 0.2 })

  return (
    <section
      ref={ref}
      className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-[720px] mx-auto mb-8 px-8"
    >
      {block.items.map((item, i) => (
        <div
          key={i}
          className="rounded-lg p-5 text-center transition-all duration-500"
          style={{
            background: 'var(--color-surface)',
            borderTop: `3px solid ${COLORS[i % COLORS.length]}`,
            opacity: isInView ? 1 : 0,
            transform: isInView ? 'translateY(0)' : 'translateY(20px)',
            transitionDelay: `${i * 100}ms`,
          }}
        >
          <h4 className="font-[family-name:var(--font-sans)] text-[0.8rem] font-semibold text-white mb-1">
            {item.label}
          </h4>
          <div
            className="font-[family-name:var(--font-mono)] text-[1.4rem] font-bold mb-1"
            style={{ color: COLORS[i % COLORS.length] }}
          >
            {item.value}
          </div>
          <p
            className="font-[family-name:var(--font-sans)] text-[0.78rem] leading-[1.45]"
            style={{ color: 'var(--color-muted)' }}
          >
            {item.description}
          </p>
        </div>
      ))}
    </section>
  )
}
