'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { ResolvedUnit, StoryConfig, ShareSectionOverride, ShareItemGroup } from '@vismay/viz-engine'
import { resolveSlotsFlat, classifyForegroundLayers } from '@vismay/viz-engine'
import AspectRatioToggle, { type AspectRatio } from './AspectRatioToggle'
import ShareCard, { type ShareCardHandle, type CardVariant } from './ShareCard'
import ShareEditDrawer, { type SelectedCard } from './ShareEditDrawer'

type EditView = 'visual' | 'yaml'

interface Props {
  slug: string
  units: ResolvedUnit[]
  config: StoryConfig
  title: string
  accessToken: string
  shareOverrides: Record<string, ShareSectionOverride> | null
  /** Raw on-disk share.yaml text (or '' when none). Source of truth for YAML view. */
  shareYamlText: string
  /** Fully-populated template generated from the story config — fed to "Insert sample". */
  sampleYaml: string
  logo?: string
  initialRatio: AspectRatio
  /**
   * Absolute base URL of the vismay.xyz admin app. The share-yaml save fetch
   * targets admin's API directly (cross-TLD); page mints this on the server
   * so the client doesn't read env vars. See docs/auth.md.
   */
  adminBaseUrl?: string
  /** Action token granting `edit-story-content` for this slug. */
  editStoryContentToken?: string
}

interface CardEntry {
  unit: ResolvedUnit
  variant: CardVariant
  label: string
  /** For `variant === 'graph'`, which foreground subset to render (split decks). */
  graphScope?: 'stat' | 'chart'
  /** For region-split graph cards (`shareGroups`): the item slice + heading. */
  itemGroup?: ShareItemGroup
}

/**
 * Build the list of cards to render. Each section gets a map-title card
 * (using its own map config) followed by its content card. Subsections
 * sharing the same parentIndex share one map slide — only the first
 * subsection emits the map-title card. Sections with `hide: true` in
 * share overrides are skipped entirely.
 */
function sliceShareParagraphs(
  all: string[],
  spec: number | [number, number]
): string[] {
  if (typeof spec === 'number') return all.slice(spec, spec + 1)
  return all.slice(spec[0], spec[1])
}

/** Normalize a paragraphsOverride entry to a string[] (one card's paragraphs). */
function normalizeOverrideEntry(entry: string | string[]): string[] {
  return typeof entry === 'string' ? [entry] : entry
}

function buildCardList(
  units: ResolvedUnit[],
  overrides: Record<string, ShareSectionOverride> | null
): CardEntry[] {
  const cards: CardEntry[] = []
  const seenParentsForMap = new Set<number>()
  for (const unit of units) {
    const sectionId = unit.parentConfig.id
    if (sectionId && overrides?.[sectionId]?.hide) continue

    const kind = unit.parentConfig.kind ?? 'text'
    const resolvedFlat = resolveSlotsFlat(unit.parentConfig)
    // A visual foreground layer (chart / image / bigStat / video / embed / rive
    // / any vertical-specific viz module) gets its own "graph" card. Prose
    // layers (text / bodyText) are excluded — share mode renders the section
    // copy via the auto / hero / stat / text variants, so a bodyText-only
    // section emits no (empty) graph card.
    const { lead: leadLayers, visual: visualLayers } = classifyForegroundLayers(
      resolvedFlat.foreground
    )
    const hasVizForeground = leadLayers.length + visualLayers.length > 0
    // Whether this section actually has a map — deck stories don't, so they
    // must NOT emit the (otherwise empty) map-title card.
    const hasMap = resolvedFlat.background.some(
      (l) => l.type === 'map' && Array.isArray((l as { center?: number[] }).center)
    )
    const isHeroLike =
      kind === 'cover' ||
      kind === 'hero' ||
      unit.parentConfig.layout === 'hero-full-bleed'
    const shareOverride = sectionId ? overrides?.[sectionId] : undefined

    // 1. Map + Heading — emitted for the first unit of each parent (using
    // the parent map view) AND for any subsequent subsection that defines
    // its own `map` override (zoomed-in subsection view).
    const subsectionConfig = unit.parentConfig.subsections?.[unit.subIndex]
    const hasSubsectionMap = !!subsectionConfig?.map
    const isFirstForParent = !seenParentsForMap.has(unit.parentIndex)
    if (isFirstForParent || hasSubsectionMap) {
      if (isFirstForParent) seenParentsForMap.add(unit.parentIndex)
      // Only when the section has a real map — otherwise (deck stories) this
      // renders as an empty translucent caption box over blank canvas.
      if (hasMap) cards.push({ unit, variant: 'map-title', label: 'map-title' })
    }

    // 2. Graph — one per subsection when a visual foreground viz is
    // configured, so each chart step (driven by subIndex) gets its own share
    // card. Sections without subsections still emit exactly one graph card.
    // When a deck section pairs a lead callout (bigStat / keyValue / quote)
    // with a visual (chart / image / 3D…), split them onto two cards — stat
    // first, then chart — instead of stacking both onto one. Hero/cover
    // sections never split (their title rides the image as an overlay).
    // Region split: `shareGroups` slices the lead list (keyValue …) into one
    // stat card per region (per-subsection override wins), then — if a visual
    // layer is also present — a single chart card after.
    const shareGroups =
      shareOverride?.subsections?.[unit.subIndex]?.shareGroups ??
      shareOverride?.shareGroups
    const hasGroupSplit =
      !isHeroLike && leadLayers.length > 0 && !!shareGroups && shareGroups.length > 0
    if (hasVizForeground) {
      if (hasGroupSplit) {
        shareGroups!.forEach((group) => {
          cards.push({ unit, variant: 'graph', label: 'stat', graphScope: 'stat', itemGroup: group })
        })
        if (visualLayers.length > 0) {
          cards.push({ unit, variant: 'graph', label: 'graph', graphScope: 'chart' })
        }
      } else if (!isHeroLike && leadLayers.length > 0 && visualLayers.length > 0) {
        cards.push({ unit, variant: 'graph', label: 'stat', graphScope: 'stat' })
        cards.push({ unit, variant: 'graph', label: 'graph', graphScope: 'chart' })
      } else {
        cards.push({ unit, variant: 'graph', label: 'graph' })
      }
    }

    // Deck cover/hero with an image foreground: the eyebrow/title/dek are
    // overlaid on the graph card (ShareDeckForeground), so the separate text
    // content card below would be redundant. Map heroes keep their text card
    // (their hero copy rides the map-title card instead).
    if (isHeroLike && hasVizForeground && !hasMap) continue

    // 3. Content cards.
    // Per-subsection overrides take precedence over section-level overrides —
    // needed when a parent has multiple subsections and only one is rewritten.
    const subOverride = shareOverride?.subsections?.[unit.subIndex]
    const paragraphsOverride =
      subOverride?.paragraphsOverride ?? shareOverride?.paragraphsOverride
    const shareParagraphs =
      subOverride?.shareParagraphs ?? shareOverride?.shareParagraphs
    const hasSplitOverride =
      (paragraphsOverride && paragraphsOverride.length > 0) ||
      (shareParagraphs && shareParagraphs.length > 0)

    // Hero/stat render as a single card by default — the variant itself
    // shapes their content. A share override may still split them.
    if (kind !== 'text' && !hasSplitOverride) {
      cards.push({ unit, variant: 'auto', label: kind })
      continue
    }

    // Stat/hero split cards keep their heading (big number / title) on every
    // card so each one renders with the same variant treatment and stands
    // alone on social. Text cards drop the heading after the first card so
    // subsequent cards read as paragraph continuations.
    const keepHeadingOnAll = kind !== 'text'

    if (paragraphsOverride && paragraphsOverride.length > 0) {
      paragraphsOverride.forEach((entry, sliceIdx) => {
        const expandedUnit: ResolvedUnit = {
          ...unit,
          heading: keepHeadingOnAll || sliceIdx === 0 ? unit.heading : undefined,
          paragraphs: normalizeOverrideEntry(entry),
        }
        cards.push({ unit: expandedUnit, variant: 'auto', label: kind })
      })
    } else if (shareParagraphs && shareParagraphs.length > 0) {
      shareParagraphs.forEach((spec, sliceIdx) => {
        const expandedUnit: ResolvedUnit = {
          ...unit,
          heading: keepHeadingOnAll || sliceIdx === 0 ? unit.heading : undefined,
          paragraphs: sliceShareParagraphs(unit.paragraphs, spec),
        }
        cards.push({ unit: expandedUnit, variant: 'auto', label: kind })
      })
    } else if (unit.paragraphs.length === 0) {
      cards.push({ unit, variant: 'auto', label: kind })
    } else {
      unit.paragraphs.forEach((p, idx) => {
        const expandedUnit: ResolvedUnit = {
          ...unit,
          heading: idx === 0 ? unit.heading : undefined,
          paragraphs: [p],
        }
        cards.push({ unit: expandedUnit, variant: 'auto', label: kind })
      })
    }
  }
  return cards
}

export default function ShareShell({
  slug,
  units,
  config,
  title,
  accessToken,
  shareOverrides,
  shareYamlText,
  sampleYaml,
  logo,
  initialRatio,
  adminBaseUrl = '',
  editStoryContentToken = '',
}: Props) {
  // `initialRatio` is seeded by the server from `?ratio=` so the first paint
  // (and the Playwright share-render capture) has the correct card dimensions.
  // After mount, `setRatio` keeps the in-page AspectRatioToggle interactive.
  const [ratio, setRatio] = useState<AspectRatio>(initialRatio)
  const [downloading, setDownloading] = useState(false)
  const cardRefs = useRef<(ShareCardHandle | null)[]>([])

  // Edit mode: holds an in-memory copy of the share overrides that drives
  // the live preview. `initialOverrides` is the saved baseline used to
  // detect dirty state. Click "Edit" to enter edit mode, then click any
  // card to open the drawer.
  const initialOverrides = useMemo<Record<string, ShareSectionOverride>>(
    () => structuredClone(shareOverrides ?? {}),
    [shareOverrides]
  )
  const [editMode, setEditMode] = useState(false)
  const [view, setView] = useState<EditView>('visual')
  const [draftOverrides, setDraftOverrides] = useState<Record<string, ShareSectionOverride>>(initialOverrides)
  const [draftYaml, setDraftYaml] = useState<string>(shareYamlText)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedCard | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const dirty = useMemo(
    () =>
      view === 'yaml'
        ? draftYaml !== shareYamlText
        : JSON.stringify(draftOverrides) !== JSON.stringify(initialOverrides),
    [view, draftYaml, shareYamlText, draftOverrides, initialOverrides],
  )

  // Reset draft when the saved baseline changes (e.g. after a successful save).
  useEffect(() => {
    setDraftOverrides(initialOverrides)
  }, [initialOverrides])
  useEffect(() => {
    setDraftYaml(shareYamlText)
  }, [shareYamlText])

  // Live-validate YAML so the toggle-back-to-visual button can refuse on
  // bad input without surprising the user at save time.
  useEffect(() => {
    if (view !== 'yaml') {
      setYamlError(null)
      return
    }
    if (draftYaml.trim().length === 0) {
      setYamlError(null)
      return
    }
    try {
      parseYaml(draftYaml)
      setYamlError(null)
    } catch (err) {
      setYamlError(err instanceof Error ? err.message : 'YAML parse error')
    }
  }, [view, draftYaml])

  const switchToYaml = useCallback(() => {
    // Prefer the on-disk text so the user sees the actual file (logo, comments,
    // ordering preserved). If they've made unsaved visual edits, serialize
    // those into the textarea instead so they aren't lost.
    if (JSON.stringify(draftOverrides) !== JSON.stringify(initialOverrides)) {
      const serialized =
        Object.keys(draftOverrides).length === 0
          ? ''
          : stringifyYaml({ sections: draftOverrides }, { lineWidth: 0, blockQuote: 'literal' })
      setDraftYaml(serialized)
    } else {
      setDraftYaml(shareYamlText)
    }
    setSelected(null)
    setView('yaml')
  }, [draftOverrides, initialOverrides, shareYamlText])

  const switchToVisual = useCallback(() => {
    if (draftYaml.trim().length === 0) {
      setDraftOverrides({})
      setView('visual')
      return
    }
    try {
      const parsed = parseYaml(draftYaml) as { sections?: Record<string, ShareSectionOverride> } | null
      const nextSections = parsed?.sections ?? {}
      setDraftOverrides(structuredClone(nextSections))
      setYamlError(null)
      setView('visual')
    } catch (err) {
      setYamlError(err instanceof Error ? err.message : 'YAML parse error')
    }
  }, [draftYaml])

  const insertSample = useCallback(() => {
    if (draftYaml.trim().length > 0 && !confirm('Replace the current YAML with the sample template?')) {
      return
    }
    setDraftYaml(sampleYaml)
  }, [draftYaml, sampleYaml])

  const downloadYaml = useCallback(() => {
    const text = draftYaml.length > 0 ? draftYaml : sampleYaml
    const blob = new Blob([text], { type: 'application/yaml;charset=utf-8' })
    saveAs(blob, `${slug}.share.yaml`)
  }, [draftYaml, sampleYaml, slug])

  // Warn before unloading if there are unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const cards = useMemo(() => buildCardList(units, draftOverrides), [units, draftOverrides])

  // Expose a headless-capture API on `window` so the demo share-render
  // pipeline can drive captures without simulating user input. Stable card
  // identity matches `lib/shareCardList.ts` so the renderer can target a
  // specific card by id. Per-(parent,sub,variant) slice counter mirrors
  // the iteration order in lib/shareCardList.ts buildShareCardList.
  useEffect(() => {
    if (typeof window === 'undefined') return
    interface CaptureWindow extends Window {
      __shareCards__?: { id: string; index: number; variant: string; label: string }[]
      __captureByIndex__?: (i: number) => Promise<string | null>
      __shareReady__?: boolean
    }
    const w = window as unknown as CaptureWindow
    const sliceCounters = new Map<string, number>()
    w.__shareCards__ = cards.map((card, i) => {
      const variantId = card.variant === 'map-title' ? 'map-title' : card.variant === 'graph' ? 'graph' : 'auto'
      const counterKey = `${card.unit.parentIndex}-${card.unit.subIndex}-${variantId}`
      const sliceIdx = sliceCounters.get(counterKey) ?? 0
      sliceCounters.set(counterKey, sliceIdx + 1)
      const id = `${card.unit.parentIndex}-${card.unit.subIndex}-${sliceIdx}-${variantId}`
      return { id, index: i, variant: card.variant, label: card.label }
    })
    w.__captureByIndex__ = async (i: number) => {
      const handle = cardRefs.current[i]
      if (!handle) return null
      return handle.capture()
    }
    w.__shareReady__ = true
    return () => {
      w.__shareReady__ = false
      delete w.__captureByIndex__
      delete w.__shareCards__
    }
  }, [cards, ratio])

  const handleSave = useCallback(async () => {
    // In YAML mode, send the textarea verbatim so user-authored comments and
    // top-level fields (e.g. `logo`) round-trip cleanly.
    const share_yaml = view === 'yaml'
      ? draftYaml
      : Object.keys(draftOverrides).length === 0
        ? ''
        : stringifyYaml({ sections: draftOverrides })
    if (view === 'yaml' && yamlError) {
      setSaveError(`YAML invalid: ${yamlError}`)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${adminBaseUrl}/api/stories/${slug}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-action-token': editStoryContentToken,
        },
        credentials: 'omit',
        body: JSON.stringify({ share_yaml }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // A 401 here means the action token minted by the page server has
        // expired (page was open past TTL) or the admin/vizmaya secrets are
        // out of sync. Reload re-mints the token from the same signed URL.
        if (res.status === 401) {
          throw new Error('Editing token expired — reload the page and retry.')
        }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      // Reload so the SSG page re-renders with the freshly saved data.
      window.location.reload()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
  }, [view, draftYaml, draftOverrides, yamlError, slug, adminBaseUrl, editStoryContentToken])

  const handleDownloadAll = useCallback(async () => {
    setDownloading(true)
    try {
      const zip = new JSZip()
      for (let i = 0; i < cards.length; i++) {
        const handle = cardRefs.current[i]
        if (!handle) continue
        const dataUrl = await handle.capture()
        if (!dataUrl) continue
        // Convert data URL to binary
        const base64 = dataUrl.split(',')[1]
        zip.file(`${slug}-${i + 1}-${ratio.replace(':', 'x')}.png`, base64, { base64: true })
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, `${slug}-share-${ratio.replace(':', 'x')}.zip`)
    } catch (err) {
      console.error('Bulk download failed:', err)
    } finally {
      setDownloading(false)
    }
  }, [slug, ratio, cards])

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-md border-b" style={{ borderColor: 'var(--color-surface)', background: 'rgb(var(--color-bg-rgb) / 0.85)' }}>
        <div className="mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <a
              href={`/story/${slug}`}
              className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--color-text)' }}
            >
              &larr; Story
            </a>
            <h1
              className="font-[family-name:var(--font-serif)] text-lg font-bold"
              style={{ color: 'var(--color-text)' }}
            >
              Share
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <AspectRatioToggle value={ratio} onChange={setRatio} />
            {editMode ? (
              <>
                {(yamlError || saveError) && (
                  <span className="text-[0.7rem] max-w-[20rem] truncate" style={{ color: 'var(--color-warn, #ff6b6b)' }} title={yamlError ?? saveError ?? undefined}>
                    {saveError ?? yamlError}
                  </span>
                )}
                <ViewToggle
                  value={view}
                  onVisual={switchToVisual}
                  onYaml={switchToYaml}
                />
                {view === 'yaml' && (
                  <>
                    <button
                      onClick={insertSample}
                      className="px-3 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider border"
                      style={{ color: 'var(--color-text)', borderColor: 'var(--color-surface)' }}
                    >
                      Insert sample
                    </button>
                    <button
                      onClick={downloadYaml}
                      className="px-3 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider border"
                      style={{ color: 'var(--color-text)', borderColor: 'var(--color-surface)' }}
                    >
                      Download
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    if (dirty && !confirm('Discard unsaved edits?')) return
                    setDraftOverrides(initialOverrides)
                    setDraftYaml(shareYamlText)
                    setSelected(null)
                    setYamlError(null)
                    setView('visual')
                    setEditMode(false)
                  }}
                  className="px-3 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider"
                  style={{ color: 'var(--color-text)', opacity: 0.7 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving || (view === 'yaml' && !!yamlError)}
                  className="px-4 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider transition-opacity disabled:opacity-40"
                  style={{
                    background: 'var(--color-accent)',
                    color: 'var(--color-bg)',
                  }}
                >
                  {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditMode(true)}
                  className="px-3 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider border"
                  style={{
                    color: 'var(--color-text)',
                    borderColor: 'var(--color-surface)',
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={handleDownloadAll}
                  disabled={downloading}
                  className="px-4 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider transition-opacity disabled:opacity-50"
                  style={{
                    background: 'var(--color-accent)',
                    color: 'var(--color-bg)',
                  }}
                >
                  {downloading ? 'Exporting...' : 'Download All'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {editMode && view === 'yaml' ? (
        <div className="max-w-5xl mx-auto px-6 py-8">
          <textarea
            value={draftYaml}
            onChange={(e) => setDraftYaml(e.target.value)}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="# No share overrides yet. Click 'Insert sample' for a populated template."
            className="w-full min-h-[70vh] rounded-md p-4 font-mono text-[13px] leading-relaxed outline-none"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: yamlError
                ? '1px solid var(--color-warn, #ff6b6b)'
                : '1px solid var(--color-surface)',
            }}
          />
          <p className="mt-2 text-[0.65rem] font-[family-name:var(--font-mono)] uppercase tracking-wider opacity-60" style={{ color: 'var(--color-text)' }}>
            Edits save to <code>{slug}.share.yaml</code>. Switch back to Visual to see the live preview.
          </p>
        </div>
      ) : (
        <>
          {/* Card grid */}
          <div
            className="mx-auto px-6 py-8"
            style={{ paddingRight: editMode && selected ? 'calc(1.5rem + 360px)' : undefined }}
          >
            <div className="flex flex-wrap gap-6 justify-center">
              {cards.map((card, i) => {
                const sectionId = card.unit.parentConfig.id
                const isSelected =
                  editMode && selected !== null && selected.index === i
                return (
                  <div
                    key={`${i}-${card.variant}-${ratio}`}
                    onClick={editMode ? () => setSelected({ index: i, unit: card.unit, variant: card.variant }) : undefined}
                    className={editMode ? 'cursor-pointer rounded-lg transition-shadow' : ''}
                    style={{
                      boxShadow: isSelected
                        ? '0 0 0 3px var(--color-accent)'
                        : editMode
                        ? '0 0 0 1px var(--color-surface)'
                        : undefined,
                    }}
                  >
                    <ShareCard
                      ref={(el) => { cardRefs.current[i] = el }}
                      unit={card.unit}
                      index={i}
                      ratio={ratio}
                      slug={slug}
                      title={title}
                      accessToken={accessToken}
                      variant={card.variant}
                      graphScope={card.graphScope ?? 'all'}
                      itemSlice={card.itemGroup?.items}
                      itemHeading={card.itemGroup?.heading}
                      shareOverride={sectionId ? draftOverrides[sectionId] : undefined}
                      palette={config.defaults.mapPalette}
                      fontstack={config.defaults.mapFontstack}
                      highlightCountry={config.defaults.highlightCountry}
                      highlightColor={config.defaults.highlightColor}
                      mapOpacity={config.defaults.mapOpacity}
                      mapStyle={config.defaults.mapStyle}
                      defaultPinColor={config.defaults.pinColor}
                      defaultPinRadius={config.defaults.pinRadius}
                      logo={logo}
                      disableDownload={editMode}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {editMode && (
            <ShareEditDrawer
              selected={selected}
              overrides={draftOverrides}
              onChange={setDraftOverrides}
              onClose={() => setSelected(null)}
              ratio={ratio}
            />
          )}
        </>
      )}
    </div>
  )
}

function ViewToggle({
  value,
  onVisual,
  onYaml,
}: {
  value: EditView
  onVisual: () => void
  onYaml: () => void
}) {
  return (
    <div
      className="inline-flex rounded-md overflow-hidden border"
      style={{ borderColor: 'var(--color-surface)' }}
    >
      {(['visual', 'yaml'] as const).map((v) => (
        <button
          key={v}
          onClick={v === 'visual' ? onVisual : onYaml}
          className="px-2.5 py-1 font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider transition-opacity"
          style={{
            background: value === v ? 'var(--color-accent)' : 'transparent',
            color: value === v ? 'var(--color-bg)' : 'var(--color-text)',
            opacity: value === v ? 1 : 0.7,
          }}
        >
          {v}
        </button>
      ))}
    </div>
  )
}
