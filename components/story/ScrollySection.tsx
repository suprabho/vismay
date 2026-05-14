'use client'

import { useState, useEffect, useRef } from 'react'
import { ScrollySectionBlock } from '@/types/story'
import { formatInlineMarkdown } from '@/lib/formatInlineMarkdown'
import ChartPanel from './ChartPanel'

export default function ScrollySection({ block }: { block: ScrollySectionBlock }) {
  const [activeStep, setActiveStep] = useState(0)
  const sectionRef = useRef<HTMLElement>(null)
  const stepsRef = useRef<(HTMLDivElement | null)[]>([])
  const hasChart = !!block.chartId

  // GSAP ScrollTrigger for step detection + card entrance animations
  useEffect(() => {
    let gsapModule: typeof import('gsap') | null = null
    let ScrollTrigger: import('gsap/ScrollTrigger').ScrollTrigger | null = null
    const triggers: import('gsap/ScrollTrigger').ScrollTrigger[] = []

    async function initGsap() {
      const { gsap } = await import('gsap')
      const { ScrollTrigger: ST } = await import('gsap/ScrollTrigger')
      gsap.registerPlugin(ST)
      gsapModule = { gsap } as typeof import('gsap')
      ScrollTrigger = ST as unknown as import('gsap/ScrollTrigger').ScrollTrigger

      // Step detection triggers
      stepsRef.current.forEach((el, index) => {
        if (!el) return
        const trigger = (ST as unknown as { create: (opts: Record<string, unknown>) => import('gsap/ScrollTrigger').ScrollTrigger }).create({
          trigger: el,
          start: 'top center',
          end: 'bottom center',
          onEnter: () => setActiveStep(index),
          onEnterBack: () => setActiveStep(index),
        })
        triggers.push(trigger)
      })

      // Card entrance animations
      stepsRef.current.forEach((el) => {
        if (!el) return
        const card = el.querySelector('.scrolly-card')
        if (!card) return
        gsap.from(card, {
          opacity: 0,
          y: 28,
          duration: 0.55,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 82%',
            toggleActions: 'play none none none',
          },
        })
      })
    }

    initGsap()

    return () => {
      triggers.forEach((t) => {
        if (t && typeof t.kill === 'function') t.kill()
      })
    }
  }, [block.steps.length])

  return (
    <section ref={sectionRef} className="relative">
      {/* Sticky chart panel */}
      {hasChart && (
        <div className="sticky top-0 h-screen flex items-center justify-center pointer-events-none z-0">
          {/* Inner card re-enables pointer events on desktop so ECharts can
              capture hover for tooltips. Mobile/portrait keeps it disabled —
              tooltips are off there anyway, and vertical swipes need to fall
              through to page scroll. Step cards remain above the chart and
              continue to receive their own events. */}
          <div className="w-full max-w-[860px] px-6 [@media(min-aspect-ratio:1/1)]:pointer-events-auto">
            <ChartPanel chartId={block.chartId} activeStep={activeStep} />
          </div>
        </div>
      )}

      {/* Step cards — scroll over the sticky chart */}
      <div className="relative z-0">
        {block.steps.map((step, i) => (
          <div
            key={i}
            ref={(el) => {
              stepsRef.current[i] = el
            }}
            className="min-h-[90vh] flex items-center max-w-[640px] mx-auto px-8"
          >
            <div
              className="scrolly-card rounded-lg p-6 backdrop-blur-sm transition-all duration-500"
              style={{
                background: 'rgb(var(--color-panel-rgb) / 0.92)',
                border: '0.5px solid var(--color-line)',
                opacity: i === activeStep ? 1 : 0.4,
                transform: i === activeStep ? 'translateY(0)' : 'translateY(10px)',
              }}
            >
              <div
                className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.15em] mb-2"
                style={{ color: 'var(--color-accent)' }}
              >
                {step.label}
              </div>
              {step.content.split('\n\n').map((para, j) => (
                <p
                  key={j}
                  className="font-[family-name:var(--font-serif)] text-[1.05rem] leading-[1.8] mb-3 last:mb-0"
                  style={{ color: 'var(--color-text)' }}
                >
                  {formatInlineMarkdown(para)}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
