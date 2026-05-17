'use client'

import { useEffect, useMemo, useState } from 'react'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type {
  ShareSectionOverride,
  ShareSubsectionOverride,
  ShareHeroOverride,
  ShareStatOverride,
  ShareTextOverride,
  ResolvedUnit,
  MapPinConfig,
  MapPinOverride,
  ShareMapAspectOverride,
  ShareAspectRatio,
} from '@/lib/storyConfig.types'
import type { MapRegion } from '@/types/story'
import type { AspectRatio } from './AspectRatioToggle'
import type { CardVariant } from './ShareCard'
import { extractHeroBits } from './ShareCard'

/**
 * Drawer tab for the Map view group. 'base' edits the section's
 * `map.{center,zoom,pitch,bearing}` (applies to all aspects); the three
 * aspect keys edit `map.ratios[<ratio>].*` (overrides that aspect only).
 */
type RatioTab = 'base' | ShareAspectRatio
const RATIO_TABS: RatioTab[] = ['base', '1:1', '3:4', '4:3']

/**
 * Which slot on the override object a card's heading/subheading edits land in.
 *   - 'top'      → bare `heading`/`subheading` (text/stat cards; the default)
 *   - 'chart'    → `chart.{heading,subheading}` (graph variant)
 *   - 'mapTitle' → `mapTitle.{heading,subheading}` (map-title overlay)
 *   - 'hero'     → `hero.{heading,subheading,dek}` (standalone hero card)
 *
 * Keeping each variant in its own slot lets one section emit different copy
 * on each of its cards (the "interlinking" we used to have when every card
 * read from the same `heading`).
 */
type TextSlot = 'top' | 'chart' | 'mapTitle' | 'hero'

function slotFor(variant: CardVariant, kind: string): TextSlot {
  if (variant === 'graph') return 'chart'
  if (variant === 'map-title') return 'mapTitle'
  if (variant === 'auto' && kind === 'hero') return 'hero'
  return 'top'
}

export interface SelectedCard {
  index: number
  unit: ResolvedUnit
  variant: CardVariant
}

interface Props {
  selected: SelectedCard | null
  overrides: Record<string, ShareSectionOverride>
  onChange: (next: Record<string, ShareSectionOverride>) => void
  onClose: () => void
  /**
   * Currently-active aspect ratio in the share grid. Drives the default
   * Map view tab so the drawer edits the framing the user is actually
   * looking at.
   */
  ratio: AspectRatio
}

/**
 * Side drawer for editing share overrides on a single card. Targets the
 * section-level override when the card's section has no subsections, else
 * targets the per-subsection override at the card's `subIndex`.
 */
export default function ShareEditDrawer({ selected, overrides, onChange, onClose, ratio }: Props) {
  // Hooks must run on every render in the same order, so derive sectionId
  // and section up here (with safe fallbacks) before any early returns.
  const sectionId = selected?.unit.parentConfig.id
  const section = useMemo<ShareSectionOverride>(
    () => (sectionId ? overrides[sectionId] : undefined) ?? {},
    [sectionId, overrides],
  )

  // YAML editor: edits this section's override slice of share.yaml. Local
  // draft so typing isn't reformatted on every keystroke. Resets to the
  // canonical stringified form whenever the section changes externally
  // (switching cards, edits via the fields above, applying a parsed YAML).
  const sectionYaml = useMemo(
    () => (isSectionEmpty(section) ? '' : stringifyYaml(section)),
    [section],
  )
  const [yamlDraft, setYamlDraft] = useState(sectionYaml)
  const [yamlError, setYamlError] = useState<string | null>(null)
  useEffect(() => {
    setYamlDraft(sectionYaml)
    setYamlError(null)
  }, [sectionYaml, sectionId])

  // Active Map-view tab. Hoisted above the early returns so the hook runs
  // on every render in the same order. Defaults to whatever aspect the
  // grid is currently showing; resets when the parent toggles to a
  // different ratio or the user picks a different card/section.
  const [ratioTab, setRatioTab] = useState<RatioTab>(ratio)
  useEffect(() => {
    setRatioTab(ratio)
  }, [ratio, sectionId])

  // Resolve the pin list ShareCard would render for this card so the drawer's
  // per-pin controls match what ships. Same precedence: share-subsection >
  // share-section > story-subsection > parent (union with subsection pins,
  // deduped by coordinates). Must run on every render (hook), so it's hoisted
  // above the early returns below and guards the null-selected case itself.
  const inheritedPins = useMemo<MapPinConfig[]>(() => {
    if (!selected) return []
    const u = selected.unit
    const hasSubs = !!u.parentConfig.subsections?.length
    const subOverride = hasSubs ? section.subsections?.[u.subIndex] ?? {} : null
    if (section.map?.pins) return section.map.pins
    if (hasSubs && subOverride?.map?.pins) return subOverride.map.pins
    const subMapPins = u.parentConfig.subsections?.[u.subIndex]?.map?.pins
    if (subMapPins) return subMapPins
    const pins: MapPinConfig[] = []
    if (u.parentConfig.map?.pins) pins.push(...u.parentConfig.map.pins)
    if (u.parentConfig.subsections) {
      for (const s of u.parentConfig.subsections) {
        if (s.map?.pins) pins.push(...s.map.pins)
      }
    }
    const seen = new Set<string>()
    return pins.filter((p) => {
      const key = `${p.coordinates[0]},${p.coordinates[1]}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [selected, section])

  if (!selected) return null
  const { unit, variant } = selected
  if (!sectionId) {
    return (
      <DrawerFrame onClose={onClose} title="Edit card">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          This section has no <code>id</code> in the config — share overrides can&apos;t target it.
          Add an <code>id</code> in the story config to enable editing.
        </p>
      </DrawerFrame>
    )
  }

  const hasSubsections = !!unit.parentConfig.subsections?.length
  const useSubsection = hasSubsections
  const sub = useSubsection ? section.subsections?.[unit.subIndex] ?? {} : null

  // Variant-aware field visibility. Each card variant writes its own slot
  // on the override object so headings on different cards in the same
  // section don't trample each other.
  const kind = unit.parentConfig.kind ?? 'text'
  const slot: TextSlot = slotFor(variant, kind)
  const isChart = slot === 'chart'
  const isMapTitle = slot === 'mapTitle'
  const isHero = slot === 'hero'
  const showHeading = true
  const showSubheading = true
  // Layers only matter on cards that render a map: map-title, and hero
  // content cards (which paint their own map background).
  const showLayers = isMapTitle || isHero
  // Pretext toggle only matters on text-body cards (ShareTextCard).
  const showPretextToggle = variant === 'auto' && kind === 'text'
  const hidePretext =
    (useSubsection ? sub?.hidePretext : section.hidePretext) ?? false

  // Read heading/subheading out of whichever slot this card edits. Each
  // slot follows the same `useSubsection ? sub : section` lookup pattern.
  const readSlot = <T,>(get: (s: ShareSectionOverride | ShareSubsectionOverride) => T | undefined): T | undefined =>
    get((useSubsection ? sub : section) ?? {})

  const heading =
    (isChart
      ? readSlot((s) => (s as ShareSectionOverride).chart?.heading)
      : isMapTitle
        ? readSlot((s) => (s as ShareSectionOverride).mapTitle?.heading)
        : isHero
          ? readSlot((s) => (s as ShareSectionOverride).hero?.heading)
          : readSlot((s) => s.heading)) ?? ''
  const subheading =
    (isChart
      ? readSlot((s) => (s as ShareSectionOverride).chart?.subheading)
      : isMapTitle
        ? readSlot((s) => (s as ShareSectionOverride).mapTitle?.subheading)
        : isHero
          ? readSlot((s) => (s as ShareSectionOverride).hero?.subheading)
          : readSlot((s) => s.subheading)) ?? ''
  // The dek slot only renders on hero-kind cards: the standalone hero card
  // (which always has a dek) and the map-title overlay when the section is
  // `kind: hero` (which renders an overlay dek beneath the heading).
  const showDek = isHero || (isMapTitle && kind === 'hero')
  const dek = !showDek
    ? ''
    : isHero
      ? readSlot((s) => (s as ShareSectionOverride).hero?.dek) ?? ''
      : readSlot((s) => (s as ShareSectionOverride).mapTitle?.dek) ?? ''
  const dekPlaceholder = showDek ? extractHeroBits(unit.paragraphs).dek : ''
  // Stat description: only renders on stat-kind auto cards. Lives in its own
  // `stat` slot so it doesn't collide with the section-level paragraphs that
  // feed other variants in the same section.
  const showStatDescription = variant === 'auto' && kind === 'stat'
  const statDescription = showStatDescription
    ? readSlot((s) => (s as ShareSectionOverride).stat?.description) ?? ''
    : ''
  const statDescriptionPlaceholder = showStatDescription ? unit.paragraphs.join(' ') : ''
  const layers = (useSubsection ? sub?.layers : section.layers) ?? {}
  const hide = section.hide ?? false

  // Resolve the regions config and the active label allowlist with the same
  // cascade ShareCard uses, so the drawer's checklist matches what's rendered.
  const subsectionRegions =
    unit.parentConfig.subsections?.[unit.subIndex]?.map?.regions
  const inheritedRegions =
    section.map?.regions ?? subsectionRegions ?? unit.parentConfig.map?.regions
  const regionItems = inheritedRegions?.items ?? []
  const inheritedLabelCodes = inheritedRegions?.labels?.codes
  const labelCodesOverride = useSubsection ? sub?.regionLabelCodes : section.regionLabelCodes
  // What's actually shown right now: override wins, else the parent's allowlist,
  // else "all items labeled" (parent has no allowlist, labels.show would emit all).
  const activeLabelCodes: string[] | null =
    labelCodesOverride ?? inheritedLabelCodes ?? null

  const writeLabelCodes = (next: string[] | undefined) => {
    if (useSubsection) writeSub({ regionLabelCodes: next })
    else writeSection({ regionLabelCodes: next })
  }

  const toggleLabelCode = (code: string, on: boolean) => {
    // Start from the active list snapshot so unchecking one of the inherited
    // codes implicitly forks an override containing the rest.
    const startingList =
      activeLabelCodes ?? regionItems.map((it) => it.code)
    const set = new Set(startingList)
    if (on) set.add(code)
    else set.delete(code)
    writeLabelCodes(Array.from(set))
  }

  // Subsection patches win, then section. Same merge order ShareCard does.
  const pinOverridesActive: Record<string, MapPinOverride> = {
    ...(section.pinOverrides ?? {}),
    ...(useSubsection ? sub?.pinOverrides ?? {} : {}),
  }

  const writePinOverride = (label: string, patch: MapPinOverride | undefined) => {
    const current = useSubsection ? sub?.pinOverrides : section.pinOverrides
    const next = { ...(current ?? {}) }
    if (patch === undefined || Object.keys(patch).length === 0) {
      delete next[label]
    } else {
      next[label] = patch
    }
    const nextValue = Object.keys(next).length === 0 ? undefined : next
    if (useSubsection) writeSub({ pinOverrides: nextValue })
    else writeSection({ pinOverrides: nextValue })
  }

  // Map view is edited at the section level regardless of subsection scope
  // (subsection cards still write into the section's `map` slot). Fallbacks
  // for placeholders come from the subsection's own map override in the main
  // config (if any), then the parent section's map.
  const subsectionMapConfig = unit.parentConfig.subsections?.[unit.subIndex]?.map
  const resolvedCenter: [number, number] | undefined =
    subsectionMapConfig?.center ?? unit.parentConfig.map?.center
  const resolvedZoom = subsectionMapConfig?.zoom ?? unit.parentConfig.map?.zoom
  const resolvedPitch =
    subsectionMapConfig?.pitch ?? unit.parentConfig.map?.pitch ?? 0
  const resolvedBearing =
    subsectionMapConfig?.bearing ?? unit.parentConfig.map?.bearing ?? 0
  const mapOverride = section.map ?? {}
  const centerOverride = mapOverride.center
  const lngOverride = centerOverride?.[0]
  const latOverride = centerOverride?.[1]

  const ratiosBlock = mapOverride.ratios ?? {}
  // Override for the currently-active aspect tab (undefined on 'base').
  const activeRatioOverride: ShareMapAspectOverride | undefined =
    ratioTab === 'base' ? undefined : ratiosBlock[ratioTab as ShareAspectRatio]

  // Field-level values + placeholders, tab-aware:
  //   value (base tab)    = section.map.{field}
  //   value (aspect tab)  = section.map.ratios[tab].{field}
  //   placeholder (base)  = subsection/parent cascade (existing behavior)
  //   placeholder (aspect)= base override field → cascade
  const activeLng =
    ratioTab === 'base' ? lngOverride : activeRatioOverride?.center?.[0]
  const activeLat =
    ratioTab === 'base' ? latOverride : activeRatioOverride?.center?.[1]
  const activeZoom =
    ratioTab === 'base' ? mapOverride.zoom : activeRatioOverride?.zoom
  const activePitch =
    ratioTab === 'base' ? mapOverride.pitch : activeRatioOverride?.pitch
  const activeBearing =
    ratioTab === 'base' ? mapOverride.bearing : activeRatioOverride?.bearing
  const placeholderLng =
    ratioTab === 'base' ? resolvedCenter?.[0] : lngOverride ?? resolvedCenter?.[0]
  const placeholderLat =
    ratioTab === 'base' ? resolvedCenter?.[1] : latOverride ?? resolvedCenter?.[1]
  const placeholderZoom =
    ratioTab === 'base' ? resolvedZoom : mapOverride.zoom ?? resolvedZoom
  const placeholderPitch =
    ratioTab === 'base' ? resolvedPitch : mapOverride.pitch ?? resolvedPitch
  const placeholderBearing =
    ratioTab === 'base' ? resolvedBearing : mapOverride.bearing ?? resolvedBearing

  const isRatioAspectEmpty = (r: ShareMapAspectOverride): boolean =>
    r.center == null && r.zoom == null && r.pitch == null && r.bearing == null

  const writeAspectMap = (next: ShareMapAspectOverride) => {
    const ratios = { ...ratiosBlock }
    if (isRatioAspectEmpty(next)) delete ratios[ratioTab as ShareAspectRatio]
    else ratios[ratioTab as ShareAspectRatio] = next
    const cleaned = Object.keys(ratios).length === 0 ? undefined : ratios
    writeSection({ map: { ...mapOverride, ratios: cleaned } })
  }

  const writeMapField = (
    field: 'zoom' | 'pitch' | 'bearing',
    value: number | undefined,
  ) => {
    if (ratioTab === 'base') {
      writeSection({ map: { ...mapOverride, [field]: value } })
      return
    }
    const current = activeRatioOverride ?? {}
    writeAspectMap({ ...current, [field]: value })
  }
  const writeMapCenter = (
    nextLng: number | undefined,
    nextLat: number | undefined,
  ) => {
    const clearCenter = nextLng === undefined && nextLat === undefined
    if (ratioTab === 'base') {
      if (clearCenter) {
        writeSection({ map: { ...mapOverride, center: undefined } })
        return
      }
      const fallbackLng = lngOverride ?? resolvedCenter?.[0] ?? 0
      const fallbackLat = latOverride ?? resolvedCenter?.[1] ?? 0
      writeSection({
        map: {
          ...mapOverride,
          center: [nextLng ?? fallbackLng, nextLat ?? fallbackLat],
        },
      })
      return
    }
    const current = activeRatioOverride ?? {}
    if (clearCenter) {
      writeAspectMap({ ...current, center: undefined })
      return
    }
    const fallbackLng =
      current.center?.[0] ?? lngOverride ?? resolvedCenter?.[0] ?? 0
    const fallbackLat =
      current.center?.[1] ?? latOverride ?? resolvedCenter?.[1] ?? 0
    writeAspectMap({
      ...current,
      center: [nextLng ?? fallbackLng, nextLat ?? fallbackLat],
    })
  }

  const yamlDirty = yamlDraft !== sectionYaml

  const applyYaml = () => {
    try {
      const trimmed = yamlDraft.trim()
      const parsed = trimmed === '' ? {} : parseYaml(trimmed)
      if (parsed != null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
        throw new Error('YAML must be an object')
      }
      const next = { ...overrides }
      const parsedSection = (parsed ?? {}) as ShareSectionOverride
      if (isSectionEmpty(parsedSection)) delete next[sectionId]
      else next[sectionId] = parsedSection
      onChange(next)
      setYamlError(null)
    } catch (e) {
      setYamlError(e instanceof Error ? e.message : 'Invalid YAML')
    }
  }

  const writeSection = (patch: Partial<ShareSectionOverride>) => {
    const nextSection: ShareSectionOverride = { ...section, ...patch }
    pruneEmpty(nextSection as unknown as Record<string, unknown>)
    const next = { ...overrides }
    if (isSectionEmpty(nextSection)) delete next[sectionId]
    else next[sectionId] = nextSection
    onChange(next)
  }

  const writeSub = (patch: Record<string, unknown>) => {
    const nextSub = { ...(sub ?? {}), ...patch }
    pruneEmpty(nextSub as Record<string, unknown>)
    const nextSubsections = { ...(section.subsections ?? {}) }
    if (Object.keys(nextSub).length === 0) delete nextSubsections[unit.subIndex]
    else nextSubsections[unit.subIndex] = nextSub
    const nextSection: ShareSectionOverride = { ...section }
    if (Object.keys(nextSubsections).length === 0) delete nextSection.subsections
    else nextSection.subsections = nextSubsections
    writeSection({ subsections: nextSection.subsections })
  }

  const writeStatDescription = (value: string | undefined) => {
    const writeStatPatch = (
      current: ShareStatOverride | undefined,
    ): ShareStatOverride | undefined => {
      const next: ShareStatOverride = { ...(current ?? {}), description: value }
      return next.description == null ? undefined : next
    }
    if (useSubsection) {
      writeSub({ stat: writeStatPatch(sub?.stat) })
    } else {
      writeSection({ stat: writeStatPatch(section.stat) })
    }
  }

  const setLayer = (key: 'pins' | 'regions' | 'heatmap', value: boolean | undefined) => {
    const nextLayers = { ...layers }
    if (value === undefined) delete nextLayers[key]
    else nextLayers[key] = value
    if (useSubsection) writeSub({ layers: nextLayers })
    else writeSection({ layers: nextLayers })
  }

  // Write a heading/subheading/dek patch to whichever slot this card edits.
  // For nested slots (chart/mapTitle/hero) we prune the slot itself when all
  // its fields go empty, so the yaml stays tidy.
  const writeText = (field: 'heading' | 'subheading' | 'dek', value: string | undefined) => {
    if (slot === 'top') {
      if (field === 'dek') return // dek only exists on hero / mapTitle slots
      if (useSubsection) writeSub({ [field]: value })
      else writeSection({ [field]: value })
      return
    }
    type NestedSlot = ShareTextOverride | ShareHeroOverride
    const slotKey = slot // 'chart' | 'mapTitle' | 'hero'
    // chart slot has no `dek`; hero + mapTitle do.
    const slotHasDek = slot === 'hero' || slot === 'mapTitle'
    const isEmptyNested = (s: NestedSlot): boolean =>
      s.heading == null && s.subheading == null && (!slotHasDek || (s as ShareHeroOverride).dek == null)
    if (useSubsection) {
      const current = (sub?.[slotKey] ?? {}) as NestedSlot
      const nextNested = { ...current, [field]: value } as NestedSlot
      writeSub({ [slotKey]: isEmptyNested(nextNested) ? undefined : nextNested })
    } else {
      const current = (section[slotKey] ?? {}) as NestedSlot
      const nextNested = { ...current, [field]: value } as NestedSlot
      writeSection({ [slotKey]: isEmptyNested(nextNested) ? undefined : nextNested } as Partial<ShareSectionOverride>)
    }
  }

  const drawerTitle = isMapTitle
    ? 'title card'
    : isChart
      ? 'chart card'
      : isHero
        ? 'hero card'
        : 'card'
  const headingPlaceholder = isChart || isMapTitle ? '—' : unit.heading ?? '—'
  const subheadingPlaceholder = isChart || isMapTitle ? '—' : unit.subheading ?? '—'

  return (
    <DrawerFrame onClose={onClose} title={`Edit ${drawerTitle}`}>
      <div className="space-y-5">
        {showHeading && (
          <div>
            <Label>{isHero ? 'Title' : 'Heading'}</Label>
            <input
              type="text"
              value={heading}
              placeholder={headingPlaceholder}
              onChange={(e) => writeText('heading', e.target.value || undefined)}
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border, transparent)',
              }}
            />
          </div>
        )}

        {showSubheading && !isHero && (
          <div>
            <Label>Subheading</Label>
            <input
              type="text"
              value={subheading}
              placeholder={subheadingPlaceholder}
              onChange={(e) => writeText('subheading', e.target.value || undefined)}
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border, transparent)',
              }}
            />
          </div>
        )}

        {showDek && (
          <div>
            <Label>{isMapTitle ? 'Dek (paragraph below heading)' : 'Dek (paragraph below title)'}</Label>
            <textarea
              value={dek}
              placeholder={dekPlaceholder || '—'}
              onChange={(e) => writeText('dek', e.target.value || undefined)}
              rows={3}
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border, transparent)',
                resize: 'vertical',
              }}
            />
          </div>
        )}

        {showStatDescription && (
          <div>
            <Label>Description</Label>
            <textarea
              value={statDescription}
              placeholder={statDescriptionPlaceholder || '—'}
              onChange={(e) => writeStatDescription(e.target.value || undefined)}
              rows={4}
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border, transparent)',
                resize: 'vertical',
              }}
            />
          </div>
        )}

        {showLayers && (
          <div>
            <Label>Map layers</Label>
            <p className="text-[0.7rem] mb-2" style={{ color: 'var(--color-muted)' }}>
              Inherit = use parent settings. Off = hide on this card.
            </p>
            <div className="space-y-2">
              <LayerRow name="Pins" value={layers.pins} onChange={(v) => setLayer('pins', v)} />
              <LayerRow name="Regions" value={layers.regions} onChange={(v) => setLayer('regions', v)} />
              <LayerRow name="Heatmap" value={layers.heatmap} onChange={(v) => setLayer('heatmap', v)} />
            </div>
          </div>
        )}

        {showLayers && regionItems.length > 0 && (
          <RegionLabelsControl
            items={regionItems}
            active={activeLabelCodes}
            isOverridden={labelCodesOverride !== undefined}
            onToggle={toggleLabelCode}
            onAllNone={(mode) =>
              writeLabelCodes(
                mode === 'all'
                  ? regionItems.map((it) => it.code)
                  : mode === 'none'
                    ? []
                    : undefined,
              )
            }
            valuePrefix={inheritedRegions?.labels?.valuePrefix ?? ''}
            valueSuffix={inheritedRegions?.labels?.valueSuffix ?? ''}
          />
        )}

        {showLayers && inheritedPins.length > 0 && (
          <PinOverridesControl
            pins={inheritedPins}
            overrides={pinOverridesActive}
            onPatch={writePinOverride}
          />
        )}

        {showLayers && (
          <div>
            <Label>Map view</Label>
            <p className="text-[0.7rem] mb-2" style={{ color: 'var(--color-muted)' }}>
              Base applies to all aspects. 1:1 / 3:4 / 4:3 override that aspect only.
            </p>
            <div
              className="inline-flex rounded-md overflow-hidden border mb-2"
              style={{ borderColor: 'var(--color-surface)' }}
            >
              {RATIO_TABS.map((tab) => {
                const isActive = tab === ratioTab
                const hasOverride =
                  tab === 'base'
                    ? mapOverride.center != null ||
                      mapOverride.zoom != null ||
                      mapOverride.pitch != null ||
                      mapOverride.bearing != null
                    : !!ratiosBlock[tab as ShareAspectRatio]
                const label = tab === 'base' ? 'Base' : tab
                return (
                  <button
                    key={tab}
                    onClick={() => setRatioTab(tab)}
                    className="px-2.5 py-1 font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider transition-opacity"
                    style={{
                      background: isActive ? 'var(--color-accent)' : 'transparent',
                      color: isActive ? 'var(--color-bg)' : 'var(--color-text)',
                      opacity: isActive ? 1 : 0.7,
                    }}
                  >
                    {label}
                    {hasOverride && !isActive && (
                      <span
                        className="ml-1 inline-block w-1.5 h-1.5 rounded-full align-middle"
                        style={{ background: 'var(--color-accent)' }}
                        aria-label="has override"
                      />
                    )}
                  </button>
                )
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Lng"
                value={activeLng}
                placeholder={placeholderLng}
                step={0.1}
                onChange={(v) => writeMapCenter(v, activeLat)}
              />
              <NumberField
                label="Lat"
                value={activeLat}
                placeholder={placeholderLat}
                step={0.1}
                onChange={(v) => writeMapCenter(activeLng, v)}
              />
              <NumberField
                label="Zoom"
                value={activeZoom}
                placeholder={placeholderZoom}
                step={0.02}
                min={0}
                max={22}
                onChange={(v) => writeMapField('zoom', v)}
              />
              <NumberField
                label="Pitch"
                value={activePitch}
                placeholder={placeholderPitch}
                step={1}
                min={0}
                max={85}
                onChange={(v) => writeMapField('pitch', v)}
              />
              <NumberField
                label="Bearing"
                value={activeBearing}
                placeholder={placeholderBearing}
                step={1}
                min={-180}
                max={360}
                onChange={(v) => writeMapField('bearing', v)}
              />
            </div>
            {ratioTab !== 'base' && activeRatioOverride && (
              <button
                onClick={() => writeAspectMap({})}
                className="mt-2 px-2 py-1 rounded text-[0.65rem] font-[family-name:var(--font-mono)] uppercase tracking-wider"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
              >
                Clear {ratioTab} override
              </button>
            )}
          </div>
        )}

        {showPretextToggle && (
          <div>
            <Label>Pretext block</Label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
              <input
                type="checkbox"
                checked={!hidePretext}
                onChange={(e) => {
                  const next = e.target.checked ? undefined : true
                  if (useSubsection) writeSub({ hidePretext: next })
                  else writeSection({ hidePretext: next })
                }}
              />
              Show pretext block on this card
            </label>
          </div>
        )}

        <div>
          <Label>Section visibility</Label>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
            <input
              type="checkbox"
              checked={hide}
              onChange={(e) => writeSection({ hide: e.target.checked || undefined })}
            />
            Hide this entire section from share mode
          </label>
        </div>

        <div>
          <Label>YAML (sections.{sectionId})</Label>
          <p className="text-[0.7rem] mb-2" style={{ color: 'var(--color-muted)' }}>
            Raw override for this section. Apply replaces all fields above.
          </p>
          <textarea
            value={yamlDraft}
            onChange={(e) => setYamlDraft(e.target.value)}
            spellCheck={false}
            rows={10}
            className="w-full rounded-md px-3 py-2 text-[0.75rem] font-[family-name:var(--font-mono)]"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border, transparent)',
              resize: 'vertical',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          />
          {yamlError && (
            <p className="text-[0.7rem] mt-1" style={{ color: 'var(--color-warn, #ff6b6b)' }}>
              {yamlError}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={applyYaml}
              disabled={!yamlDirty}
              className="px-3 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider transition-opacity disabled:opacity-40"
              style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
            >
              Apply
            </button>
            <button
              onClick={() => {
                setYamlDraft(sectionYaml)
                setYamlError(null)
              }}
              disabled={!yamlDirty}
              className="px-3 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider transition-opacity disabled:opacity-40"
              style={{ color: 'var(--color-text)', border: '1px solid var(--color-surface)' }}
            >
              Revert
            </button>
          </div>
        </div>
      </div>
    </DrawerFrame>
  )
}

function DrawerFrame({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div
      className="fixed top-0 right-0 h-full w-[360px] z-40 border-l overflow-y-auto"
      style={{
        background: 'var(--color-bg)',
        borderColor: 'var(--color-surface)',
      }}
    >
      <div
        className="sticky top-0 px-5 py-3 border-b flex items-center justify-between"
        style={{ background: 'var(--color-bg)', borderColor: 'var(--color-surface)' }}
      >
        <h2 className="font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
          {title}
        </h2>
        <button
          onClick={onClose}
          className="text-sm opacity-60 hover:opacity-100"
          style={{ color: 'var(--color-text)' }}
          aria-label="Close drawer"
        >
          ✕
        </button>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.15em] mb-1"
      style={{ color: 'var(--color-accent)' }}
    >
      {children}
    </div>
  )
}

function NumberField({
  label,
  value,
  placeholder,
  step,
  min,
  max,
  onChange,
}: {
  label: string
  value: number | undefined
  placeholder: number | undefined
  step?: number
  min?: number
  max?: number
  onChange: (v: number | undefined) => void
}) {
  const clamp = (n: number) => {
    let r = n
    if (min !== undefined) r = Math.max(min, r)
    if (max !== undefined) r = Math.min(max, r)
    return r
  }
  return (
    <label className="flex flex-col gap-1">
      <span
        className="font-[family-name:var(--font-mono)] text-[0.6rem] uppercase tracking-[0.12em]"
        style={{ color: 'var(--color-muted)' }}
      >
        {label}
      </span>
      <input
        type="number"
        value={value ?? ''}
        placeholder={placeholder != null ? String(placeholder) : '—'}
        step={step}
        // min/max enforced in onChange below. Omitting them from the element
        // keeps the browser from clamping spinner output — otherwise a down-
        // step from empty on a min=0 field (e.g. zoom) collapses to 0, which
        // the placeholder-anchored heuristic below can't distinguish.
        onKeyDown={(e) => {
          if (value !== undefined || placeholder == null) return
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
          e.preventDefault()
          const s = step ?? 1
          onChange(clamp(e.key === 'ArrowUp' ? placeholder + s : placeholder - s))
        }}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') return onChange(undefined)
          const n = Number(raw)
          if (!Number.isFinite(n)) return
          // Spinner click on an empty input: browser anchors at 0 and emits ±step.
          // Re-anchor to the placeholder so the stepper continues from the inherited value.
          if (value === undefined && placeholder != null) {
            const s = step ?? 1
            const eps = Math.abs(s) / 1000
            if (Math.abs(n - s) < eps) return onChange(clamp(placeholder + s))
            if (Math.abs(n + s) < eps) return onChange(clamp(placeholder - s))
          }
          onChange(clamp(n))
        }}
        className="w-full rounded-md px-2 py-1.5 text-sm"
        style={{
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border, transparent)',
        }}
      />
    </label>
  )
}

function RegionLabelsControl({
  items,
  active,
  isOverridden,
  onToggle,
  onAllNone,
  valuePrefix,
  valueSuffix,
}: {
  items: MapRegion[]
  active: string[] | null
  isOverridden: boolean
  onToggle: (code: string, on: boolean) => void
  onAllNone: (mode: 'all' | 'none' | 'inherit') => void
  valuePrefix: string
  valueSuffix: string
}) {
  const [query, setQuery] = useState('')
  // When the override is unset, treat every item as "labeled" if the parent
  // has no allowlist, OR only the parent's allowlist when it does. Same
  // resolution logic ShareCard runs.
  const activeSet = useMemo(
    () => new Set(active ?? items.map((it) => it.code)),
    [active, items],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.code.toLowerCase().includes(q))
  }, [items, query])
  const checkedCount = active === null ? items.length : active.length

  return (
    <div>
      <Label>
        Region labels
        <span className="ml-2 normal-case tracking-normal text-[0.6rem]" style={{ color: 'var(--color-muted)' }}>
          {checkedCount}/{items.length} shown
          {isOverridden ? '' : ' (inherited)'}
        </span>
      </Label>
      <p className="text-[0.7rem] mb-2" style={{ color: 'var(--color-muted)' }}>
        Pick which regions render a centroid label on this card.
      </p>
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => onAllNone('all')}
          className="px-2 py-1 rounded text-[0.65rem] font-[family-name:var(--font-mono)] uppercase tracking-wider"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
        >
          All
        </button>
        <button
          onClick={() => onAllNone('none')}
          className="px-2 py-1 rounded text-[0.65rem] font-[family-name:var(--font-mono)] uppercase tracking-wider"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
        >
          None
        </button>
        <button
          onClick={() => onAllNone('inherit')}
          disabled={!isOverridden}
          className="px-2 py-1 rounded text-[0.65rem] font-[family-name:var(--font-mono)] uppercase tracking-wider disabled:opacity-40"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
        >
          Inherit
        </button>
      </div>
      {items.length > 8 && (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          className="w-full rounded-md px-2 py-1 mb-2 text-[0.75rem]"
          style={{
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border, transparent)',
          }}
        />
      )}
      <div
        className="max-h-56 overflow-y-auto rounded-md py-1"
        style={{ border: '1px solid var(--color-surface)' }}
      >
        {filtered.length === 0 ? (
          <p className="text-[0.7rem] px-3 py-2" style={{ color: 'var(--color-muted)' }}>
            No regions match.
          </p>
        ) : (
          filtered.map((it) => {
            const checked = activeSet.has(it.code)
            return (
              <label
                key={it.code}
                className="flex items-center gap-2 px-3 py-1 text-[0.8rem] cursor-pointer"
                style={{ color: 'var(--color-text)' }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggle(it.code, e.target.checked)}
                />
                <span className="flex-1 truncate">{it.code}</span>
                {typeof it.value === 'number' && (
                  <span className="text-[0.7rem]" style={{ color: 'var(--color-muted)' }}>
                    {valuePrefix}{it.value.toLocaleString()}{valueSuffix}
                  </span>
                )}
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}

function PinOverridesControl({
  pins,
  overrides,
  onPatch,
}: {
  pins: MapPinConfig[]
  overrides: Record<string, MapPinOverride>
  onPatch: (label: string, patch: MapPinOverride | undefined) => void
}) {
  // Pins with no `label` can't be targeted (the override map is label-keyed),
  // so surface them as disabled rows with an explainer instead of hiding them.
  const labeled = pins.filter((p) => !!p.label)
  const unlabeledCount = pins.length - labeled.length

  return (
    <div>
      <Label>
        Pin overrides
        <span className="ml-2 normal-case tracking-normal text-[0.6rem]" style={{ color: 'var(--color-muted)' }}>
          {Object.keys(overrides).length}/{labeled.length} customized
        </span>
      </Label>
      <p className="text-[0.7rem] mb-2" style={{ color: 'var(--color-muted)' }}>
        Per-pin tweaks (color, anchor, size, pulse). Inherited until you change a field.
      </p>
      <div className="space-y-2">
        {labeled.map((pin) => {
          const label = pin.label!
          const patch = overrides[label] ?? {}
          const merged: MapPinConfig = { ...pin, ...patch }
          const setField = <K extends keyof MapPinOverride>(field: K, value: MapPinOverride[K] | undefined) => {
            const nextPatch = { ...patch }
            if (value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value))) {
              delete nextPatch[field]
            } else {
              nextPatch[field] = value
            }
            onPatch(label, Object.keys(nextPatch).length === 0 ? undefined : nextPatch)
          }
          const hidden = patch.hidden ?? false
          return (
            <div
              key={label}
              className="rounded-md p-2"
              style={{
                border: '1px solid var(--color-surface)',
                opacity: hidden ? 0.5 : 1,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-block w-3 h-3 rounded-full shrink-0"
                  style={{ background: merged.color ?? 'var(--color-accent)' }}
                />
                <span className="text-[0.8rem] truncate" style={{ color: 'var(--color-text)' }}>
                  {label}
                </span>
                <label
                  className="ml-auto flex items-center gap-1 text-[0.65rem] font-[family-name:var(--font-mono)] uppercase tracking-wider cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                  title="Toggle this pin on this card"
                >
                  <input
                    type="checkbox"
                    checked={!hidden}
                    onChange={(e) => setField('hidden', e.target.checked ? undefined : true)}
                  />
                  Shown
                </label>
                {Object.keys(patch).length > 0 && (
                  <button
                    onClick={() => onPatch(label, undefined)}
                    className="text-[0.65rem] font-[family-name:var(--font-mono)] uppercase tracking-wider opacity-70 hover:opacity-100"
                    style={{ color: 'var(--color-text)' }}
                    title="Clear this pin's overrides"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div
                className="grid grid-cols-2 gap-2"
                style={{ pointerEvents: hidden ? 'none' : undefined }}
              >
                <label className="flex flex-col gap-1">
                  <span
                    className="font-[family-name:var(--font-mono)] text-[0.6rem] uppercase tracking-[0.12em]"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Color
                  </span>
                  <input
                    type="text"
                    value={patch.color ?? ''}
                    placeholder={pin.color ?? '$accent'}
                    onChange={(e) => setField('color', e.target.value || undefined)}
                    className="w-full rounded-md px-2 py-1 text-sm"
                    style={{
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border, transparent)',
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span
                    className="font-[family-name:var(--font-mono)] text-[0.6rem] uppercase tracking-[0.12em]"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Anchor
                  </span>
                  <select
                    value={patch.labelAnchor ?? ''}
                    onChange={(e) => setField('labelAnchor', (e.target.value || undefined) as MapPinOverride['labelAnchor'])}
                    className="w-full rounded-md px-2 py-1 text-sm"
                    style={{
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border, transparent)',
                    }}
                  >
                    <option value="">inherit ({pin.labelAnchor ?? 'top'})</option>
                    <option value="top">top</option>
                    <option value="bottom">bottom</option>
                    <option value="left">left</option>
                    <option value="right">right</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span
                    className="font-[family-name:var(--font-mono)] text-[0.6rem] uppercase tracking-[0.12em]"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Radius
                  </span>
                  <input
                    type="number"
                    value={patch.radius ?? ''}
                    placeholder={pin.radius != null ? String(pin.radius) : '—'}
                    step={1}
                    min={0}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (raw === '') return setField('radius', undefined)
                      const n = Number(raw)
                      if (Number.isFinite(n)) setField('radius', n)
                    }}
                    className="w-full rounded-md px-2 py-1 text-sm"
                    style={{
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border, transparent)',
                    }}
                  />
                </label>
                <label className="flex items-center gap-2 self-end text-sm pb-1" style={{ color: 'var(--color-text)' }}>
                  <input
                    type="checkbox"
                    checked={patch.pulse ?? pin.pulse ?? false}
                    onChange={(e) => {
                      // Only write override when it diverges from the inherited value.
                      const inherited = pin.pulse ?? false
                      setField('pulse', e.target.checked === inherited ? undefined : e.target.checked)
                    }}
                  />
                  Pulse
                </label>
              </div>
            </div>
          )
        })}
        {unlabeledCount > 0 && (
          <p className="text-[0.65rem]" style={{ color: 'var(--color-muted)' }}>
            {unlabeledCount} pin{unlabeledCount === 1 ? '' : 's'} without a `label` field can&apos;t be overridden here.
          </p>
        )}
      </div>
    </div>
  )
}

function LayerRow({
  name,
  value,
  onChange,
}: {
  name: string
  value: boolean | undefined
  onChange: (v: boolean | undefined) => void
}) {
  const state: 'inherit' | 'on' | 'off' = value === undefined ? 'inherit' : value ? 'on' : 'off'
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--color-text)' }}>{name}</span>
      <div className="flex gap-1">
        {(['inherit', 'on', 'off'] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt === 'inherit' ? undefined : opt === 'on')}
            className="px-2 py-1 rounded text-[0.7rem] font-[family-name:var(--font-mono)] uppercase tracking-wider transition-opacity"
            style={{
              background: state === opt ? 'var(--color-accent)' : 'var(--color-surface)',
              color: state === opt ? 'var(--color-bg)' : 'var(--color-text)',
              opacity: state === opt ? 1 : 0.7,
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function isSectionEmpty(s: ShareSectionOverride): boolean {
  return (
    s.heading == null &&
    s.subheading == null &&
    s.hide == null &&
    s.hidePretext == null &&
    s.layers == null &&
    s.chart == null &&
    s.mapTitle == null &&
    s.hero == null &&
    s.stat == null &&
    s.shareParagraphs == null &&
    s.paragraphsOverride == null &&
    s.subsections == null &&
    s.regionLabelCodes == null &&
    s.pinOverrides == null &&
    s.map == null
  )
}

function pruneEmpty(obj: Record<string, unknown>) {
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (v == null) {
      delete obj[key]
      continue
    }
    if (typeof v === 'object' && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>
      pruneEmpty(inner)
      if (Object.keys(inner).length === 0) delete obj[key]
    }
  }
}
