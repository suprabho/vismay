'use client'

import type { ResolvedUnit, StatColor } from '@vismay/viz-engine'
import { resolveSlots, resolveSlotsFlat, ForegroundLayoutSlot } from '@vismay/viz-engine'
import { formatInlineMarkdown, getListItems, isListBlock } from '@vismay/viz-engine'
import { HeroPanel, HeroPanelTitle, HeroPanelDek } from './Hero'
import { statColorVar } from './ThemeProvider'

interface Props {
  unitIndex: number
  unit: ResolvedUnit
  /**
   * 9:16 autoplay only (`?autoplay=1` + portrait iframe, used by the
   * vertical video-render pipeline) hides the text card entirely — only
   * the map + chart play. 16:9 autoplay keeps the text card so the
   * landscape video has section copy on screen. The snap target stays
   * mounted either way so the IntersectionObserver still drives
   * camera/chart cues; dropping it would shorten the rendered video.
   */
  isAutoplay?: boolean
  /**
   * Deck live-scroll only. When true, this section renders its own foreground
   * layer stack INSIDE the snap target (in the scroll flow) rather than
   * leaving an empty target for the shell's fixed overlay to fill. This is
   * what makes deck content scroll with the page like the map-format text
   * cards — smooth section transitions, and wheel/touch over any slot reaches
   * the scroll container. The shell only sets this for `mode === 'scroll'`;
   * autoplay/capture/print keep the fixed-overlay path.
   */
  renderForegroundInline?: boolean
  /** Story slug — forwarded to in-flow foreground slots so charts find their JSON. */
  slug?: string
  /** Render mode — forwarded to in-flow foreground slots. */
  mode?: 'scroll' | 'autoplay' | 'capture' | 'print'
  /** Portrait (mobile) viewport — forwarded to in-flow foreground slots. */
  isPortrait?: boolean
}

/**
 * Pull a `*italic dek*` line and a `**bold byline**` line out of the
 * paragraphs returned for a hero section. Falls back to plain paragraphs
 * if the markers aren't present.
 */
function extractHeroBits(paragraphs: string[]): { dek: string; byline: string } {
  const dek =
    paragraphs.find((p) => /^\*[^*]/.test(p))?.replace(/^\*+|\*+$/g, '').trim() ?? ''
  const byline =
    paragraphs.find((p) => p.startsWith('**'))?.replace(/^\*+|\*+$/g, '').trim() ?? ''
  return { dek, byline }
}

/**
 * One viewport-tall snap target.
 *
 * Renders ONLY the text panel — the chart and map are page-level fixed
 * panels owned by StoryMapShell, so they persist across subsections of the
 * same parent (allowing chart animations to resume rather than re-mount).
 *
 * Landscape layout:
 *   - With a chart: chart panel occupies the top half of the right 63vw
 *     column (h-[50vh]); text card stacks directly beneath it in the
 *     bottom half (top-[50vh], h-[50vh]). Left 37vw stays clear for the
 *     map focal area.
 *   - Without a chart: text card claims the right 63vw × full-height slot
 *     (mirroring the chart position), so hero titles, stat numbers, and
 *     act intros use the same prime real estate the graph would have. The
 *     bottom-left 37% × 60% region stays clear for the map focal area.
 *
 * Portrait layout: text card centered below the top-pinned chart strip
 * (or centered with no top strip when chartless).
 */
/**
 * Deck-format section kinds that suppress the section text card entirely —
 * the visual is composed through foreground vizslots (`bigStat`, `bodyText`,
 * `quote`, etc.) in named layout regions. The snap target still mounts so
 * the IntersectionObserver drives `activeUnit`.
 */
const DECK_KINDS_NO_TEXT_CARD = new Set<string>([
  'bigStat',
  'bodyText',
  'split',
  'data',
  'gallery',
  'quote',
  'divider',
  'closing',
])

/**
 * Map deck-format aliases to the legacy section-text variants the renderer
 * already knows how to draw. The deck format adds `cover` as a richer
 * hero variant; both render through the hero panel.
 */
function aliasKind(kind: string): string {
  if (kind === 'cover') return 'hero'
  return kind
}

export default function MapStorySection({
  unitIndex,
  unit,
  isAutoplay = false,
  renderForegroundInline = false,
  slug = '',
  mode = 'scroll',
  isPortrait = false,
}: Props) {
  const { parentConfig, heading, subheading, paragraphs, heroPart } = unit
  const rawKind = parentConfig.kind ?? 'text'
  const kind = aliasKind(rawKind)
  const heroBits = kind === 'hero' ? extractHeroBits(paragraphs) : null
  // `hasChart` historically gated by the legacy `chart:` field — it really
  // means "is the foreground slot occupied", since the text card needs to
  // dodge the foreground card's top-half real estate in landscape. After the
  // viz-registry refactor, sections can fill the slot via `foreground:` too.
  const hasChart = !!parentConfig.chart || resolveSlotsFlat(parentConfig).foreground.length > 0
  // Region-mode sections render their text through the body region's text
  // module (see ForegroundLayoutSlot). The section's own text card is
  // suppressed to avoid double rendering — only the snap target stays so
  // the IntersectionObserver still drives `activeUnit`.
  const resolvedFg = resolveSlots(parentConfig).foreground
  const usesRegions = resolvedFg.kind === 'regions'

  // Deck live-scroll: this section's foreground, rendered in-flow so it scrolls
  // with the page. A flat foreground (deck section with no `layout:`) is wrapped
  // into a single-region `free` layout so its slots inherit the deck safe-area
  // inset — mirroring the shell's fixed-overlay synthesis. `activeStep` is this
  // section's own subIndex (its scrub position when it's the active unit).
  const inlineForeground = !renderForegroundInline ? null : (
    <ForegroundLayoutSlot
      slug={slug}
      foreground={
        resolvedFg.kind === 'flat'
          ? { kind: 'regions', layout: 'free', regions: { default: resolvedFg.layers } }
          : resolvedFg
      }
      unit={unit}
      activeStep={unit.subIndex ?? 0}
      mode={mode}
      isPortrait={isPortrait}
    />
  )
  // Deck-format kinds (other than cover/hero) carry their visual entirely
  // through composed foreground vizslots — the section text card must not
  // render or it would duplicate copy that lives in `bodyText` / `bigStat`
  // / `quote` slots inside the layout regions.
  const suppressForDeckKind = DECK_KINDS_NO_TEXT_CARD.has(rawKind)

  // Editorial full-bleed hero — must run BEFORE the generic deck-suppress
  // branch below. Setting `section.layout` auto-wraps the foreground into
  // regions form, which would otherwise drop us into the empty-snap-target
  // path and we'd never paint the scrim + headline overlay.
  if (
    kind === 'hero' &&
    parentConfig.layout === 'hero-full-bleed' &&
    heading &&
    (heroPart === 'title' || heroPart === undefined)
  ) {
    // Deck-format cover sections carry dek/byline as direct YAML fields on
    // the section (not as italic/bold markers in the markdown body, which is
    // the legacy hero convention). Prefer those when present.
    const cfgAny = parentConfig as unknown as { dek?: string; byline?: string }
    const dek = cfgAny.dek ?? heroBits?.dek ?? ''
    const byline = cfgAny.byline ?? heroBits?.byline ?? ''
    return (
      <section
        data-unit-index={unitIndex}
        className={`snap-start snap-always h-svh w-full relative${
          renderForegroundInline ? ' overflow-hidden' : ''
        }`}
        style={{ zIndex: 20 }}
      >
        {/* Deck live-scroll: the cover image renders in-flow here (behind the
            scrim + headline) so it scrolls with the section. Off-deck this is
            null and the image comes from the shell's fixed overlay. */}
        {inlineForeground}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[70%] pointer-events-none"
          style={{
            background:
              'linear-gradient(to top, rgba(8,9,14,0.78) 0%, rgba(8,9,14,0.45) 40%, rgba(8,9,14,0.12) 75%, transparent 100%)',
          }}
        />
        <div
          className="absolute pointer-events-auto"
          style={{ left: '6vw', right: '6vw', bottom: '8vh' }}
        >
          <div className="max-w-[60ch]">
            <HeroPanel
              title={heading}
              dek={dek}
              byline={byline}
              eyebrow={parentConfig.eyebrow}
              onImagery
            />
          </div>
        </div>
      </section>
    )
  }

  if (usesRegions || suppressForDeckKind) {
    return (
      <section
        data-unit-index={unitIndex}
        // `overflow-hidden` only when rendering in-flow: each deck section is a
        // viewport-tall slide, so over-tall content (e.g. a long `bodyText`)
        // must clip at the section edge instead of bleeding into the adjacent
        // snap target as it scrolls past. Off-deck this is an empty target.
        className={`snap-start snap-always h-svh w-full relative${
          renderForegroundInline ? ' overflow-hidden' : ''
        }`}
      >
        {inlineForeground}
      </section>
    )
  }

  // Autoplay mode: render only the snap target (no text card, no hero panel).
  // Stat sections are an exception — the number IS the visual, so it renders
  // centered in the viewport like the chart panel does. The hero dek slice is
  // portrait-only — kept for parity with the non-autoplay split so
  // landscape/portrait unit counts match.
  if (isAutoplay) {
    const portraitOnly =
      kind === 'hero' && heroPart === 'dek'
        ? ' [@media(min-aspect-ratio:1/1)]:hidden'
        : ''
    if (kind === 'stat' && heading) {
      return (
        <section
          data-unit-index={unitIndex}
          className={`snap-start snap-always h-svh w-full relative${portraitOnly}`}
        >
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(90vw,80vh)] rounded-lg p-6 backdrop-blur-3xl pointer-events-none z-10"
            style={{
              background: 'rgb(var(--color-panel-rgb) / 0.5)',
              border: '0.5px solid var(--color-line)',
            }}
          >
            <StatPanel
              value={heading}
              subheading={subheading}
              description={paragraphs.join(' ')}
              color={parentConfig.color}
            />
          </div>
        </section>
      )
    }
    return (
      <section
        data-unit-index={unitIndex}
        className={`snap-start snap-always h-svh w-full relative${portraitOnly}`}
      />
    )
  }

  // Two static class strings — Tailwind v4 JIT picks both up because they
  // appear literally in the source. Selected at render time.
  const landscapeSlotClasses = hasChart
    ? // Bottom-right 63vw × 50vh — sits directly beneath the chart panel
      // (which owns the top 50vh of the same right column).
      [
        '[@media(min-aspect-ratio:1/1)]:left-auto',
        '[@media(min-aspect-ratio:1/1)]:right-0',
        '[@media(min-aspect-ratio:1/1)]:top-[50vh]',
        '[@media(min-aspect-ratio:1/1)]:translate-x-0',
        '[@media(min-aspect-ratio:1/1)]:w-[63vw]',
        '[@media(min-aspect-ratio:1/1)]:h-[50vh]',
        '[@media(min-aspect-ratio:1/1)]:p-10',
      ]
    : // Right 63vw × full-height — reuses the chart slot.
      [
        '[@media(min-aspect-ratio:1/1)]:left-auto',
        '[@media(min-aspect-ratio:1/1)]:right-0',
        '[@media(min-aspect-ratio:1/1)]:top-0',
        '[@media(min-aspect-ratio:1/1)]:translate-x-0',
        '[@media(min-aspect-ratio:1/1)]:w-[63vw]',
        '[@media(min-aspect-ratio:1/1)]:h-screen',
        '[@media(min-aspect-ratio:1/1)]:p-10',
      ]

  const cardClasses = [
    'absolute rounded-lg p-6 backdrop-blur-sm',
    '[@media(min-aspect-ratio:1/1)]:overflow-y-auto',
    'left-1/2 -translate-x-1/2 bottom-4',
    'w-[90vw] max-w-[640px] max-h-[50svh]',
    ...landscapeSlotClasses,
    '[@media(min-aspect-ratio:1/1)]:max-w-none',
    '[@media(min-aspect-ratio:1/1)]:max-h-none',
  ].join(' ')

  const cardStyle = {
    background: 'rgb(var(--color-panel-rgb) / 0.5)',
    border: '0.5px solid var(--color-line)',
  }

  // Hero rendering. Mobile units pass `heroPart` to address each half by its
  // own `data-unit-index`; desktop units have heroPart undefined and render
  // both halves with the same index (the dek section is portrait-hidden, so
  // landscape only shows the full HeroPanel).
  if (kind === 'hero') {
    const showTitle = heroPart === 'title' || heroPart === undefined
    const showDek = heroPart === 'dek' || heroPart === undefined

    return (
      <>
        {showTitle && heading && (
          <section
            data-unit-index={unitIndex}
            className="snap-start snap-always h-svh w-full relative"
          >
            <div className={cardClasses} style={cardStyle}>
              <div className="mx-auto h-full flex flex-col justify-center">
                {/* Landscape: full hero (only used when heroPart is undefined,
                    i.e. desktop units; mobile 'title' units never reach
                    landscape rendering). */}
                <div className="hidden [@media(min-aspect-ratio:1/1)]:block">
                  <HeroPanel
                    title={heading}
                    dek={heroBits?.dek ?? ''}
                    byline={heroBits?.byline ?? ''}
                    eyebrow={parentConfig.eyebrow}
                  />
                </div>
                {/* Portrait: eyebrow + title only */}
                <div className="[@media(min-aspect-ratio:1/1)]:hidden">
                  <HeroPanelTitle title={heading} eyebrow={parentConfig.eyebrow} />
                </div>
              </div>
            </div>
          </section>
        )}
        {showDek && (
          <section
            data-unit-index={unitIndex}
            className="snap-start snap-always h-svh w-full relative [@media(min-aspect-ratio:1/1)]:hidden"
          >
            <div className={cardClasses} style={cardStyle}>
              <div className="mx-auto h-full flex flex-col justify-center">
                <HeroPanelDek dek={heroBits?.dek ?? ''} byline={heroBits?.byline ?? ''} />
              </div>
            </div>
          </section>
        )}
      </>
    )
  }

  return (
    <section
      data-unit-index={unitIndex}
      className="snap-start snap-always h-svh w-full relative"
    >
      <div className={cardClasses} style={cardStyle}>
        <div className="mx-auto h-full flex flex-col justify-center">
          {kind === 'stat' && heading ? (
            <StatPanel
              value={heading}
              subheading={subheading}
              description={paragraphs.join(' ')}
              color={parentConfig.color}
            />
          ) : (
            <TextPanel
              heading={heading}
              paragraphs={paragraphs}
              anchorMiss={parentConfig.text ?? '(no anchor)'}
            />
          )}
        </div>
      </div>
    </section>
  )
}

/* ─── Sub-panels ────────────────────────────────────────────────────── */

function TextPanel({
  heading,
  paragraphs,
  anchorMiss,
}: {
  heading: string | undefined
  paragraphs: string[]
  anchorMiss: string
}) {
  return (
    <>
      {heading && (
        <div
          className="font-[family-name:var(--font-mono)] text-[1rem] uppercase tracking-[0.15em] mb-3"
          style={{ color: 'var(--color-accent)' }}
        >
          {heading}
        </div>
      )}
      {paragraphs.length > 0 ? (
        paragraphs.map((p, i) =>
          isListBlock(p) ? (
            <ul
              key={i}
              className="font-[family-name:var(--font-serif)] text-[1.4rem] leading-[1.7] mb-3 last:mb-0 list-disc pl-5"
              style={{ color: 'var(--color-text)' }}
            >
              {getListItems(p).map((item, j) => (
                <li key={j}>{formatInlineMarkdown(item)}</li>
              ))}
            </ul>
          ) : (
            <p
              key={i}
              className="font-[family-name:var(--font-serif)] text-[1.4rem] leading-[1.7] mb-3 last:mb-0"
              style={{ color: 'var(--color-text)' }}
            >
              {formatInlineMarkdown(p)}
            </p>
          )
        )
      ) : (
        <p
          className="font-[family-name:var(--font-mono)] text-[0.7rem] opacity-60"
          style={{ color: 'var(--color-muted, #aca286)' }}
        >
          [missing markdown anchor: {anchorMiss}]
        </p>
      )}
    </>
  )
}

/**
 * `kind: stat` — display the section's heading as a giant number with the
 * body text as caption beneath. Mirrors the legacy StatBlock visual.
 * Color comes from the section's `color` field (theme token); defaults to accent2.
 */
function StatPanel({
  value,
  subheading,
  description,
  color: colorToken,
}: {
  value: string
  subheading?: string
  description: string
  color?: StatColor
}) {
  const color = statColorVar(colorToken)

  return (
    <div className="flex flex-col items-center text-center py-4">
      <div
        className="font-serif text-[clamp(3.5rem,11vw,7.5rem)] font-bold leading-none mb-3"
        style={{ color }}
      >
        {value}
      </div>
      {subheading && (
        <div
          className="font-mono text-[1rem] uppercase tracking-[0.15em] mb-3"
          style={{ color: 'var(--color-accent)' }}
        >
          {subheading}
        </div>
      )}
      <div
        className="font-sans text-[0.95rem] leading-[1.55]"
        style={{ color: 'var(--color-muted)' }}
      >
        {description}
      </div>
    </div>
  )
}
