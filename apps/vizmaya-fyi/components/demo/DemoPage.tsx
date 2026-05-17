import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  Film,
  Mail,
  MapPin,
  Presentation,
  Quote,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { DemoContent, LucideIcon } from '@/lib/storyDemoConfig'
import type { Theme } from '@vismay/viz-engine'
import VizmayaLogo from '@/components/VizmayaLogo'
import AuraBackground from '@/components/AuraBackground'
import StoryPreview from './StoryPreview'
import ShareGallery from './ShareGallery'
import VideoGallery from './VideoGallery'
import PdfGallery from './PdfGallery'

/**
 * Default theme used when the underlying story doesn't have one (or fails
 * to load). Matches the cocoa-and-cream palette from the original pitch
 * sample so a brand-new demo still looks polished.
 */
const FALLBACK_THEME: Theme = {
  colors: {
    background: '#14120E',
    text: '#F4ECD8',
    accent: '#B5563D',
    accent2: '#E8A87C',
    teal: '#00E6D9',
    surface: '#1A1813',
    muted: '#7A7466',
    line: '#28241E',
  },
  fonts: {
    serif: 'Fraunces',
    sans: 'ui-sans-serif',
    mono: 'ui-monospace',
  },
}

/**
 * Convert a `#rrggbb` hex into a space-separated RGB triple so the demo
 * tokens can compose alpha via `rgb(var(--demo-fg-rgb) / 0.x)`. Same
 * helper as components/story/ThemeProvider.tsx — kept inline here so the
 * demo subtree stays self-contained and doesn't drag in story chrome.
 */
function hexToRgbTriple(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return '20 18 14'
  const n = parseInt(match[1], 16)
  return `${(n >> 16) & 0xff} ${(n >> 8) & 0xff} ${n & 0xff}`
}

const ICON_MAP: Record<LucideIcon, ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  MapPin,
  Film,
  FileText,
  Presentation,
  Quote,
  Mail,
  ArrowRight,
  ArrowUpRight,
}

interface ShareCardId {
  parentIndex: number
  subIndex: number
  sliceIndex?: number | null
  variant: string
  label: string
}

interface Props {
  clientSlug: string
  storySlug: string
  content: DemoContent
  shareCardIds: ShareCardId[]
  shareAssets: { card_id: string; ratio: string; public_url: string }[]
  videoPreview916: { public_url: string; duration_ms: number | null } | null
  videoPreview169: { public_url: string; duration_ms: number | null } | null
  pdfReport: { public_url: string; thumbnail_url: string | null } | null
  pdfSlides: { public_url: string; thumbnail_url: string | null } | null
  /** Theme of the underlying story — drives demo color tokens + fonts. */
  theme?: Theme | null
  /** Aura embed slug for the underlying story — rendered behind the hero. */
  auraSlug?: string | null
  /** Google Fonts import URL for the story's serif/sans/mono. */
  fontImportUrl?: string | null
}

function buildDemoVars(theme: Theme): React.CSSProperties {
  const bgRgb = hexToRgbTriple(theme.colors.background)
  const fgRgb = hexToRgbTriple(theme.colors.text)
  const accentRgb = hexToRgbTriple(theme.colors.accent)
  const lineRgb = hexToRgbTriple(theme.colors.line ?? theme.colors.muted)
  return {
    '--demo-bg': theme.colors.background,
    '--demo-bg-rgb': bgRgb,
    '--demo-bg-2': theme.colors.surface,
    '--demo-fg': theme.colors.text,
    '--demo-fg-rgb': fgRgb,
    '--demo-accent-rgb': accentRgb,
    '--demo-line-rgb': lineRgb,
    '--demo-fg-dim': `rgb(${fgRgb} / 0.75)`,
    '--demo-fg-mute': `rgb(${fgRgb} / 0.5)`,
    '--demo-fg-line': `rgb(${lineRgb} / 0.18)`,
    '--demo-accent': theme.colors.accent,
    '--demo-accent-soft': `rgb(${accentRgb} / 0.08)`,
    '--demo-serif-font': `${theme.fonts.serif}, 'Fraunces', Georgia, serif`,
    '--demo-sans-font': `${theme.fonts.sans}, ui-sans-serif, system-ui, -apple-system, sans-serif`,
  } as React.CSSProperties
}

export default function DemoPage({
  clientSlug,
  storySlug,
  content,
  shareAssets,
  videoPreview916,
  videoPreview169,
  pdfReport,
  pdfSlides,
  theme,
  auraSlug,
  fontImportUrl,
}: Props) {
  const effectiveTheme = theme ?? FALLBACK_THEME
  const vars = buildDemoVars(effectiveTheme)

  // Wire the story's own colors into the Rive logo so it picks up the
  // story's brand palette (e.g. teal/accent variants), not a hardcoded
  // cocoa-and-cream. VizmayaLogo's parser only handles 6-digit hex, so
  // we pass color tokens directly.
  const logoPalette = {
    text: effectiveTheme.colors.text,
    teal: effectiveTheme.colors.teal,
    accent: effectiveTheme.colors.accent,
    accent2: effectiveTheme.colors.accent2,
    surface: effectiveTheme.colors.surface,
    muted: effectiveTheme.colors.muted,
    line: effectiveTheme.colors.line ?? effectiveTheme.colors.muted,
  }

  return (
    <div
      style={{
        ...vars,
        background: 'var(--demo-bg)',
        color: 'var(--demo-fg)',
        fontFamily: 'var(--demo-sans-font)',
      }}
    >
      <FontImports url={fontImportUrl ?? null} />
      <DemoNav logoPalette={logoPalette} />
      <Hero content={content.hero} auraSlug={auraSlug ?? null} />
      <DemoSection content={content.demo_section} storySlug={storySlug} />
      <ValueProps items={content.value_props} />
      <Offering content={content.offering} />
      <ShareGallery assets={shareAssets} />
      <VideoGallery
        clientSlug={clientSlug}
        storySlug={storySlug}
        v916={videoPreview916}
        v169={videoPreview169}
      />
      <PdfGallery report={pdfReport} slides={pdfSlides} storySlug={storySlug} />
      <Process content={content.process} />
      <Pricing content={content.pricing} />
      <PullQuote content={content.pull_quote} />
      <Cta content={content.cta} />
    </div>
  )
}

/* ─── Sticky nav ────────────────────────────────────────────────────── */

function DemoNav({ logoPalette }: { logoPalette: LogoPalette }) {
  return (
    <nav
      className="sticky top-0 z-40 backdrop-blur-md"
      style={{
        // Translucent demo-bg so the blur shows through. `supports` fallback
        // to a solid bg keeps it readable on browsers without
        // `backdrop-filter` support (older Firefox builds).
        background: 'rgb(var(--demo-bg-rgb) / 0.72)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        backdropFilter: 'blur(14px) saturate(140%)',
        borderBottom: '1px solid var(--demo-fg-line)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex justify-between items-center">
        <VizmayaLogo
          className="w-[140px] h-[34px] md:w-[180px] md:h-[44px]"
          palette={logoPalette}
        />
        <div
          className="hidden md:flex gap-8 text-xs uppercase tracking-[0.25em]"
          style={{ color: 'rgb(var(--demo-fg-rgb) / 0.65)' }}
        >
          <a href="#demo">Live demo</a>
          <a href="#offer">What we ship</a>
          <a href="#process">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Talk to us</a>
        </div>
      </div>
    </nav>
  )
}

function FontImports({ url }: { url: string | null }) {
  // Always include Fraunces as a sensible default (if the story's serif
  // happens to be Fraunces too, the second @import is a no-op). The story's
  // own font URL covers any other family.
  const fraunces =
    "@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400&display=swap');"
  const story = url ? `@import url('${url}');` : ''
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
${fraunces}
${story}
.demo-serif { font-family: var(--demo-serif-font, 'Fraunces', Georgia, serif); font-variation-settings: "opsz" 144; }
.demo-hero-aura .bn-aura { position: absolute; inset: 0; overflow: hidden; }
.demo-hero-aura .bn-aura iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; background: transparent; }
        `,
      }}
    />
  )
}

/* ─── Hero ──────────────────────────────────────────────────────────── */

interface LogoPalette {
  text: string
  teal: string
  accent: string
  accent2: string
  surface: string
  muted: string
  line: string
}

function Hero({
  content,
  auraSlug,
}: {
  content: DemoContent['hero']
  auraSlug: string | null
}) {
  return (
    <header
      className="relative overflow-hidden"
      style={{ background: 'var(--demo-bg)', minHeight: '92vh' }}
    >
      {auraSlug && (
        <div
          className="absolute inset-0 pointer-events-none demo-hero-aura"
          aria-hidden
        >
          <AuraBackground slug={auraSlug} />
        </div>
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 1200px 700px at 75% 20%, rgb(var(--demo-bg-rgb) / 0.0), rgb(var(--demo-bg-rgb) / 0.55) 55%, rgb(var(--demo-bg-rgb) / 0.92) 100%),
            linear-gradient(to bottom, rgb(var(--demo-bg-rgb) / 0.35), rgb(var(--demo-bg-rgb) / 0.85))
          `,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 800px 500px at 80% 30%, rgb(var(--demo-accent-rgb) / 0.10), transparent 60%),
            radial-gradient(ellipse 600px 400px at 15% 75%, rgb(var(--demo-fg-rgb) / 0.04), transparent 60%)
          `,
        }}
      />
      <div className="relative max-w-7xl mx-auto px-6 md:px-12 pt-16 md:pt-24 pb-24 md:pb-32">
        <div className="text-xs uppercase tracking-[0.3em] mb-8" style={{ color: 'var(--demo-accent)' }}>
          {content.brand_kicker}
        </div>
        <h1
          className="demo-serif text-5xl md:text-7xl lg:text-8xl leading-[0.95] tracking-tight max-w-5xl"
          style={{ color: 'var(--demo-fg)' }}
        >
          {content.title.pre}
          <br />
          <span className="italic" style={{ color: 'var(--demo-accent)' }}>
            {content.title.italic}
          </span>{' '}
          {content.title.post}
        </h1>
        <p
          className="mt-10 text-lg md:text-xl leading-relaxed max-w-2xl"
          style={{ color: 'var(--demo-fg-dim)' }}
        >
          {content.description}
        </p>
        <div className="mt-12 flex flex-wrap gap-4">
          <a
            href={content.cta_primary.href}
            className="inline-flex items-center gap-3 px-7 py-4 text-sm uppercase tracking-[0.2em] transition-all hover:gap-5"
            style={{ background: 'var(--demo-fg)', color: 'var(--demo-bg)' }}
          >
            {content.cta_primary.label} <ArrowRight size={16} strokeWidth={2.5} />
          </a>
          <a
            href={content.cta_secondary.href}
            className="inline-flex items-center gap-3 px-7 py-4 text-sm uppercase tracking-[0.2em] border transition-all"
            style={{ borderColor: 'rgb(var(--demo-fg-rgb) / 0.3)', color: 'var(--demo-fg)' }}
          >
            {content.cta_secondary.label}
          </a>
        </div>

        <div
          className="mt-20 pt-8 border-t flex flex-wrap gap-x-12 gap-y-3 text-xs uppercase tracking-[0.2em]"
          style={{ borderColor: 'var(--demo-fg-line)', color: 'var(--demo-fg-mute)' }}
        >
          {content.trust_strip.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </div>
    </header>
  )
}

/* ─── Demo Section (interactive story preview) ──────────────────────── */

function DemoSection({
  content,
  storySlug,
}: {
  content: DemoContent['demo_section']
  storySlug: string
}) {
  return (
    <section
      id="demo"
      className="border-t"
      style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="mb-12 md:mb-16 max-w-3xl">
          <div
            className="text-xs uppercase tracking-[0.3em] mb-4"
            style={{ color: 'var(--demo-fg-mute)' }}
          >
            {content.kicker}
          </div>
          <h2
            className="demo-serif text-4xl md:text-6xl leading-[1.05] mb-6 whitespace-pre-line"
            style={{ color: 'var(--demo-fg)' }}
          >
            {content.title}
          </h2>
          <p className="text-lg leading-relaxed" style={{ color: 'var(--demo-fg-dim)' }}>
            {content.source_note}
          </p>
        </div>
        <StoryPreview storySlug={storySlug} />
      </div>
    </section>
  )
}

/* ─── ValueProps ────────────────────────────────────────────────────── */

function ValueProps({ items }: { items: DemoContent['value_props'] }) {
  return (
    <section
      className="border-t"
      style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg-2)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="grid md:grid-cols-3 gap-12 md:gap-16">
          {items.map((p, i) => (
            <div key={i}>
              <div
                className="demo-serif text-7xl md:text-8xl mb-4 leading-none"
                style={{ color: 'var(--demo-accent)' }}
              >
                {p.stat}
              </div>
              <p className="text-base leading-relaxed" style={{ color: 'var(--demo-fg-dim)' }}>
                {p.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Offering ──────────────────────────────────────────────────────── */

function Offering({ content }: { content: DemoContent['offering'] }) {
  return (
    <section
      id="offer"
      className="border-t"
      style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg-2)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="grid md:grid-cols-12 gap-12 mb-16">
          <div className="md:col-span-5">
            <div
              className="text-xs uppercase tracking-[0.3em] mb-4"
              style={{ color: 'var(--demo-accent)' }}
            >
              {content.intro_kicker}
            </div>
            <h2
              className="demo-serif text-4xl md:text-5xl leading-[1.05] whitespace-pre-line"
              style={{ color: 'var(--demo-fg)' }}
            >
              {content.intro_title}
            </h2>
          </div>
          <div className="md:col-span-7 md:pt-4">
            <p className="text-lg leading-relaxed" style={{ color: 'var(--demo-fg-dim)' }}>
              {content.intro_body}
            </p>
          </div>
        </div>

        <div
          className="grid md:grid-cols-2 gap-px"
          style={{ background: 'var(--demo-fg-line)' }}
        >
          {content.items.map((item, i) => {
            const Icon = ICON_MAP[item.icon] ?? MapPin
            return (
              <div
                key={i}
                className="p-8 md:p-10 transition-colors"
                style={{ background: 'var(--demo-bg-2)' }}
              >
                <div className="flex items-start gap-5">
                  <div
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      width: 56,
                      height: 56,
                      background: 'rgb(var(--demo-accent-rgb) / 0.12)',
                      color: 'var(--demo-accent)',
                    }}
                  >
                    <Icon size={26} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div
                      className="text-[10px] uppercase tracking-[0.25em] mb-2"
                      style={{ color: 'var(--demo-accent)' }}
                    >
                      {item.kicker}
                    </div>
                    <h3 className="demo-serif text-2xl mb-3" style={{ color: 'var(--demo-fg)' }}>
                      {item.title}
                    </h3>
                    <p className="text-base leading-relaxed" style={{ color: 'var(--demo-fg-dim)' }}>
                      {item.detail}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ─── Process ───────────────────────────────────────────────────────── */

function Process({ content }: { content: DemoContent['process'] }) {
  return (
    <section
      id="process"
      className="border-t"
      style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="mb-16 max-w-2xl">
          <div
            className="text-xs uppercase tracking-[0.3em] mb-4"
            style={{ color: 'var(--demo-accent)' }}
          >
            {content.kicker}
          </div>
          <h2
            className="demo-serif text-4xl md:text-5xl leading-[1.05]"
            style={{ color: 'var(--demo-fg)' }}
          >
            {content.title}
          </h2>
        </div>

        <div className="grid md:grid-cols-4 gap-8">
          {content.steps.map((s) => (
            <div
              key={s.n}
              className="border-t pt-6"
              style={{ borderColor: 'rgb(var(--demo-accent-rgb) / 0.4)' }}
            >
              <div
                className="demo-serif text-5xl mb-4"
                style={{ color: 'var(--demo-accent)' }}
              >
                {s.n}
              </div>
              <div
                className="text-[10px] uppercase tracking-[0.25em] mb-2"
                style={{ color: 'var(--demo-fg-mute)' }}
              >
                {s.time}
              </div>
              <h3 className="demo-serif text-xl mb-3" style={{ color: 'var(--demo-fg)' }}>
                {s.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--demo-fg-dim)' }}>
                {s.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Pricing ───────────────────────────────────────────────────────── */

function Pricing({ content }: { content: DemoContent['pricing'] }) {
  return (
    <section
      id="pricing"
      className="border-t"
      style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg-2)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="mb-16 max-w-2xl">
          <div
            className="text-xs uppercase tracking-[0.3em] mb-4"
            style={{ color: 'var(--demo-accent)' }}
          >
            {content.kicker}
          </div>
          <h2
            className="demo-serif text-4xl md:text-5xl leading-[1.05]"
            style={{ color: 'var(--demo-fg)' }}
          >
            {content.title}
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-px" style={{ background: 'var(--demo-fg-line)' }}>
          {content.tiers.map((tier, i) => (
            <div
              key={i}
              className="p-8 md:p-10 flex flex-col"
              style={{
                background: tier.featured
                  ? 'var(--demo-accent-soft)'
                  : 'var(--demo-bg-2)',
                borderTop: tier.featured ? '2px solid var(--demo-accent)' : undefined,
              }}
            >
              <div
                className="text-[10px] uppercase tracking-[0.25em] mb-3"
                style={{ color: tier.featured ? 'var(--demo-accent)' : 'var(--demo-fg-mute)' }}
              >
                {tier.featured ? 'Most popular' : 'Tier'}
              </div>
              <h3 className="demo-serif text-2xl mb-2" style={{ color: 'var(--demo-fg)' }}>
                {tier.name}
              </h3>
              <div className="flex items-baseline gap-2 mb-6">
                <span
                  className="demo-serif text-3xl"
                  style={{ color: 'var(--demo-fg)' }}
                >
                  {tier.price}
                </span>
                <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--demo-fg-mute)' }}>
                  {tier.cadence}
                </span>
              </div>
              <ul className="space-y-2 mb-8 flex-1">
                {tier.features.map((f, j) => (
                  <li
                    key={j}
                    className="text-sm leading-relaxed flex items-start gap-2"
                    style={{ color: 'var(--demo-fg-dim)' }}
                  >
                    <span style={{ color: 'var(--demo-accent)' }}>→</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={tier.cta.href}
                className="inline-flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-[0.2em] transition-all"
                style={{
                  background: tier.featured ? 'var(--demo-fg)' : 'transparent',
                  border: tier.featured ? 'none' : '1px solid rgb(var(--demo-fg-rgb) / 0.3)',
                  color: tier.featured ? 'var(--demo-bg)' : 'var(--demo-fg)',
                }}
              >
                {tier.cta.label} <ArrowRight size={14} strokeWidth={2.5} />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Pull Quote ────────────────────────────────────────────────────── */

function PullQuote({ content }: { content: DemoContent['pull_quote'] }) {
  return (
    <section
      className="border-t"
      style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg)' }}
    >
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-20 md:py-32 text-center">
        <Quote
          size={48}
          strokeWidth={1.5}
          style={{ color: 'var(--demo-accent)', margin: '0 auto 32px' }}
        />
        <p
          className="demo-serif text-3xl md:text-5xl leading-[1.15] italic"
          style={{ color: 'var(--demo-fg)' }}
        >
          {content.body}
        </p>
        <div
          className="mt-10 text-xs uppercase tracking-[0.3em]"
          style={{ color: 'var(--demo-fg-mute)' }}
        >
          {content.attribution}
        </div>
      </div>
    </section>
  )
}

/* ─── CTA + Footer ──────────────────────────────────────────────────── */

function Cta({ content }: { content: DemoContent['cta'] }) {
  return (
    <section
      id="contact"
      className="border-t"
      style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg-2)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-24 md:py-32">
        <div className="grid md:grid-cols-12 gap-12 items-end">
          <div className="md:col-span-8">
            <div
              className="text-xs uppercase tracking-[0.3em] mb-6"
              style={{ color: 'var(--demo-accent)' }}
            >
              {content.kicker}
            </div>
            <h2
              className="demo-serif text-5xl md:text-7xl leading-[1] tracking-tight whitespace-pre-line"
              style={{ color: 'var(--demo-fg)' }}
            >
              {content.title}
            </h2>
            <p
              className="mt-8 text-lg leading-relaxed max-w-2xl"
              style={{ color: 'var(--demo-fg-dim)' }}
            >
              {content.description}
            </p>
          </div>
          <div className="md:col-span-4">
            <a
              href={`mailto:${content.email}`}
              className="block p-8 transition-all group"
              style={{ background: 'var(--demo-fg)', color: 'var(--demo-bg)' }}
            >
              <Mail size={28} strokeWidth={1.5} className="mb-6" />
              <div className="text-xs uppercase tracking-[0.25em] mb-2 opacity-80">Write to us</div>
              <div className="demo-serif text-2xl mb-6">{content.email}</div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em]">
                Open mail <ArrowUpRight size={14} strokeWidth={2.5} />
              </div>
            </a>
          </div>
        </div>

        <div
          className="mt-24 pt-8 border-t flex flex-col md:flex-row md:justify-between gap-4 text-xs uppercase tracking-[0.25em]"
          style={{ borderColor: 'var(--demo-fg-line)', color: 'var(--demo-fg-mute)' }}
        >
          <div>{content.footer.left}</div>
          <div>{content.footer.right}</div>
        </div>
      </div>
    </section>
  )
}
