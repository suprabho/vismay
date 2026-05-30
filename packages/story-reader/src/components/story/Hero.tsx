import { HeroBlock } from '@vismay/viz-engine'

interface HeroPanelProps {
  title: string
  dek: string
  byline: string
  eyebrow?: string
  /**
   * When true, the panel sits on top of imagery (e.g. the SpaceX full-bleed
   * Falcon photograph). Eyebrow/dek/byline switch to light-on-dark so they
   * read against the gradient scrim, and the H1 inks white. Tracking on the
   * eyebrow bumps to 0.2em for headlines-grade caps gravity.
   */
  onImagery?: boolean
}

// `font-variation-settings` pushes Fraunces toward its display optical size
// (opsz 144) with a heavier SOFT axis (50) so the H1 reads with proper
// thin/thick contrast and sharper ball terminals at 60px+ — the
// text-grade default is too uniform for editorial display use.
const FRAUNCES_DISPLAY: React.CSSProperties = {
  fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'wght' 700",
  letterSpacing: '-0.015em',
}

/**
 * Eyebrow + plain serif h1 + dek + byline, with NO outer section/min-h
 * wrapper. Embeddable inside other layouts — used by both the legacy Hero
 * and MapStorySection's `kind: hero` mode.
 */
export function HeroPanel({ title, dek, byline, eyebrow, onImagery = false }: HeroPanelProps) {
  const eyebrowColor = onImagery ? 'rgba(255,255,255,0.92)' : 'var(--color-accent)'
  const titleColor = onImagery ? 'rgba(255,255,255,0.98)' : 'var(--color-text)'
  const dekColor = onImagery ? 'rgba(255,255,255,0.82)' : 'var(--color-muted)'
  const bylineColor = onImagery ? 'rgba(255,255,255,0.72)' : 'var(--color-muted)'
  const eyebrowTracking = onImagery ? 'tracking-[0.2em]' : 'tracking-[0.15em]'

  return (
    <div className="flex flex-col">
      {eyebrow && (
        <div
          className={`font-[family-name:var(--font-mono)] text-[0.85rem] uppercase ${eyebrowTracking} mb-6`}
          style={{ color: eyebrowColor }}
        >
          {eyebrow}
        </div>
      )}
      <h1
        className="font-serif font-bold leading-[1.05] text-[2.75rem] md:text-[3.75rem] mb-5"
        style={{ color: titleColor, ...FRAUNCES_DISPLAY }}
      >
        {title}
      </h1>
      <p
        className="text-[1.2rem] leading-[1.55] mb-8 max-w-[42ch]"
        style={{ color: dekColor }}
      >
        {dek}
      </p>
      <div
        className="font-[family-name:var(--font-mono)] text-[0.8rem] uppercase tracking-[0.12em]"
        style={{ color: bylineColor }}
      >
        {byline}
      </div>
    </div>
  )
}

/** Eyebrow + Title only — used as the first mobile hero snap section. */
export function HeroPanelTitle({
  title,
  eyebrow,
  onImagery = false,
}: Pick<HeroPanelProps, 'title' | 'eyebrow' | 'onImagery'>) {
  const eyebrowColor = onImagery ? 'rgba(255,255,255,0.92)' : 'var(--color-accent)'
  const titleColor = onImagery ? 'rgba(255,255,255,0.98)' : 'var(--color-text)'
  const eyebrowTracking = onImagery ? 'tracking-[0.2em]' : 'tracking-[0.15em]'

  return (
    <div className="flex flex-col">
      {eyebrow && (
        <div
          className={`font-[family-name:var(--font-mono)] text-[0.85rem] uppercase ${eyebrowTracking} mb-6`}
          style={{ color: eyebrowColor }}
        >
          {eyebrow}
        </div>
      )}
      <h1
        className="font-serif font-bold leading-[1.05] text-[2.25rem]"
        style={{ color: titleColor, ...FRAUNCES_DISPLAY }}
      >
        {title}
      </h1>
    </div>
  )
}

/** Dek + Byline only — used as the second mobile hero snap section. */
export function HeroPanelDek({
  dek,
  byline,
  onImagery = false,
}: Pick<HeroPanelProps, 'dek' | 'byline' | 'onImagery'>) {
  const dekColor = onImagery ? 'rgba(255,255,255,0.82)' : 'var(--color-muted)'
  const bylineColor = onImagery ? 'rgba(255,255,255,0.72)' : 'var(--color-muted)'
  return (
    <div className="flex flex-col">
      <p className="text-[1.2rem] leading-[1.55] mb-8" style={{ color: dekColor }}>
        {dek}
      </p>
      <div
        className="font-[family-name:var(--font-mono)] text-[0.8rem] uppercase tracking-[0.12em]"
        style={{ color: bylineColor }}
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
