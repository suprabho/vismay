'use client'

import { useRef } from 'react'
import { useInView } from '@/lib/use-in-view'
import { TakeawayGridBlock } from '@/types/story'

const BORDER_COLORS = ['var(--color-accent)', 'var(--color-accent2)', 'var(--color-teal)']

export default function TakeawayGrid({ block }: { block: TakeawayGridBlock }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { threshold: 0.2 })

  return (
    <section className="py-12">
      <div
        className="text-center mb-8 font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.15em]"
        style={{ color: 'var(--color-accent)' }}
      >
        What to watch
      </div>
      <div
        ref={ref}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-[860px] mx-auto px-8"
      >
        {block.items.map((item, i) => (
          <div
            key={i}
            className="rounded-lg p-6 transition-all duration-500"
            style={{
              background: 'var(--color-surface)',
              borderTop: `3px solid ${BORDER_COLORS[i % BORDER_COLORS.length]}`,
              opacity: isInView ? 1 : 0,
              transform: isInView ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: `${i * 100}ms`,
            }}
          >
            <h4
              className="font-[family-name:var(--font-sans)] text-[0.8rem] font-semibold uppercase tracking-[0.08em] mb-2"
              style={{ color: BORDER_COLORS[i % BORDER_COLORS.length] }}
            >
              For {item.audience}
            </h4>
            <p
              className="font-[family-name:var(--font-serif)] text-[0.95rem] leading-[1.6]"
              style={{ color: 'var(--color-text)' }}
            >
              {item.content}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
