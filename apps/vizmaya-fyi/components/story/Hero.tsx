import { HeroBlock } from '@vismay/viz-engine'

interface HeroPanelProps {
  title: string
  dek: string
  byline: string
  eyebrow?: string
}

/**
 * Eyebrow + plain serif h1 + dek + byline, with NO outer section/min-h
 * wrapper. Embeddable inside other layouts — used by both the legacy Hero
 * and MapStorySection's `kind: hero` mode.
 */
export function HeroPanel({ title, dek, byline, eyebrow }: HeroPanelProps) {
  return (
    <div className="flex flex-col">
      {eyebrow && (
        <div
          className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.15em] mb-6"
          style={{ color: 'var(--color-accent)' }}
        >
          {eyebrow}
        </div>
      )}
      <h1
        className="font-serif font-bold leading-[1.1] text-[2.5rem] md:text-[3rem] mb-5"
        style={{ color: 'var(--color-text)' }}
      >
        {title}
      </h1>
      <p
        className="text-[1.1rem] leading-[1.65] mb-8"
        style={{ color: 'var(--color-muted)' }}
      >
        {dek}
      </p>
      <div
        className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.1em]"
        style={{ color: 'var(--color-muted)' }}
      >
        {byline}
      </div>
    </div>
  )
}

/** Eyebrow + Title only — used as the first mobile hero snap section. */
export function HeroPanelTitle({ title, eyebrow }: Pick<HeroPanelProps, 'title' | 'eyebrow'>) {
  return (
    <div className="flex flex-col">
      {eyebrow && (
        <div
          className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.15em] mb-6"
          style={{ color: 'var(--color-accent)' }}
        >
          {eyebrow}
        </div>
      )}
      <h1
        className="font-serif font-bold leading-[1.1] text-[2.25rem]"
        style={{ color: 'var(--color-text)' }}
      >
        {title}
      </h1>
    </div>
  )
}

/** Dek + Byline only — used as the second mobile hero snap section. */
export function HeroPanelDek({ dek, byline }: Pick<HeroPanelProps, 'dek' | 'byline'>) {
  return (
    <div className="flex flex-col">
      <p
        className="text-[1.1rem] leading-[1.65] mb-8"
        style={{ color: 'var(--color-muted)' }}
      >
        {dek}
      </p>
      <div
        className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.1em]"
        style={{ color: 'var(--color-muted)' }}
      >
        {byline}
      </div>
    </div>
  )
}

export default function Hero({ block }: { block: HeroBlock }) {
  return (
    <section className="min-h-screen flex flex-col justify-center px-8 py-12 max-w-[900px] mx-auto">
      <HeroPanel
        title={block.title}
        dek={block.dek}
        byline={block.byline}
        eyebrow="Cost Analysis · March 2026"
      />
    </section>
  )
}
