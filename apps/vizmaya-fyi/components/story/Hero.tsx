import { HeroBlock } from '@/types/story'
import HeroTitle, {
  type TitleSegment,
  krFlag,
  brainIcon,
  shipIcon,
  oilDrumIcon,
  boltIcon,
} from './HeroTitle'

const LANDSCAPE_SEGMENTS: TitleSegment[] = [
  { type: 'pill', icon: krFlag, text: 'South Korea' },
  { type: 'text', content: ' Makes the ' },
  { type: 'pill', icon: brainIcon, text: 'Memory' },
  { type: 'text', content: ' and Builds the ' },
  { type: 'pill', icon: shipIcon, text: 'Ships' },
  { type: 'text', content: '. It Just Lost All ' },
  { type: 'pill', icon: boltIcon, text: '3 Energy Lines.' },
  { type: 'text', content: ' ' },
  { type: 'icon-pill', icon: oilDrumIcon, text: 'LNG', color: '#155dfc' },
  { type: 'text', content: ' ' },
  { type: 'icon-pill', icon: oilDrumIcon, text: 'Oil', color: '#f54900' },
  { type: 'text', content: ' ' },
  { type: 'icon-pill', icon: oilDrumIcon, text: 'He', color: '#2d7a4f' },
]

const PORTRAIT_SEGMENTS: TitleSegment[] = [
  { type: 'pill', icon: krFlag, text: 'South Korea' },
  { type: 'break' },
  { type: 'text', content: 'Makes the ' },
  { type: 'pill', icon: brainIcon, text: 'Memory' },
  { type: 'text', content: ' &' },
  { type: 'break' },
  { type: 'text', content: 'Builds the ' },
  { type: 'pill', icon: shipIcon, text: 'Ships' },
  { type: 'break' },
  { type: 'text', content: 'It Just Lost All' },
  { type: 'break' },
  { type: 'pill', icon: boltIcon, text: '3 Energy Lines.' },
  { type: 'break' },
  { type: 'icon-pill', icon: oilDrumIcon, text: 'LNG', color: '#155dfc' },
  { type: 'text', content: ' ' },
  { type: 'icon-pill', icon: oilDrumIcon, text: 'Oil', color: '#f54900' },
  { type: 'text', content: ' ' },
  { type: 'icon-pill', icon: oilDrumIcon, text: 'He', color: '#2d7a4f' },
]

function buildTitleSegments(title: string): { segments: TitleSegment[]; portraitSegments: TitleSegment[] } {
  if (title.toLowerCase().includes('south korea')) {
    return { segments: LANDSCAPE_SEGMENTS, portraitSegments: PORTRAIT_SEGMENTS }
  }
  return { segments: [{ type: 'text', content: title }], portraitSegments: [{ type: 'text', content: title }] }
}

interface HeroPanelProps {
  title: string
  dek: string
  byline: string
  eyebrow?: string
}

/**
 * The pretext-styled hero content (mono eyebrow, animated SVG title with
 * pills/icons, dek, byline) with NO outer section/min-h wrapper. Embeddable
 * inside other layouts — used by both the legacy Hero and MapStorySection's
 * `kind: hero` mode.
 */
export function HeroPanel({ title, dek, byline, eyebrow }: HeroPanelProps) {
  const { segments, portraitSegments } = buildTitleSegments(title)

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
      <div className="mb-5">
        <HeroTitle segments={segments} portraitSegments={portraitSegments} />
      </div>
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
  const { segments, portraitSegments } = buildTitleSegments(title)

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
      <div>
        <HeroTitle segments={segments} portraitSegments={portraitSegments} />
      </div>
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
