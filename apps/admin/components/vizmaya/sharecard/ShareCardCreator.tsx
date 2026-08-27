'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { ResolvedUnit, Theme, MapPalette, MapView, StorySectionConfig } from '@vismay/viz-engine'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import ThemeProvider from '@/components/canvas/ThemeProvider'
import VerticalLoader from '@/components/canvas/VerticalLoader'
import MapPickerModal from '@/components/vizmaya/MapPickerModal'
import { FrameCorners, Image as ImageIcon, Palette, Stack, TextT, type Icon as PhosphorIcon } from '@phosphor-icons/react'
import { flushSync } from 'react-dom'
import ShareCard, { RENDER_SIZE, OUTPUT_SIZE, type ShareCardHandle } from './ShareCard'
import { ASPECT_RATIOS, SHARE_FOCUS_AREA } from './constants'
import { seedTemplate, detectSupport, SEED_GRAPHIC_ID } from './layers/seedTemplate'
import { isUmamiKind, type CardComposition, type MapSpec, type TemplateKind, type Transform, type UmamiTemplateKind } from './layers/types'
import { remapCompositionTheme } from './layers/retheme'
import { UMAMI_PAPER, UMAMI_SPICE, UMAMI_THEMES, umamiThemeName, type UmamiThemeName } from './umami/themes'
import { seedUmamiTemplate, type UmamiDishLite, type UmamiSeedContent } from './umami/seeds'
import { UMAMI_STYLE_TEMPLATES } from './umami/styles'
import { DishPicker } from './umami/DishPicker'
import { ExtraStyleTemplatesContext } from './composer/ImagePicker'
import {
  applyV1Overrides,
  composeBaseType,
  normalizeComposition,
  snapshotVersion,
  templateKindFromV1,
} from './layers/migrate'
import { LayerPanel } from './composer/LayerPanel'
import { Inspector } from './composer/Inspector'
import { ThemePanel } from './composer/ThemePanel'
import {
  getSelectedText,
  patchElementTransform,
  patchSelectedText,
  type Selection,
} from './composer/mutations'
import { groupBBox, type GroupBBox, moveGroupBy, rotateGroupAround, scaleGroupAround } from './composer/groupTransform'
import type { AnyShareCardSnapshot, SavedCard, VizmayaShareCardSnapshotV2 } from './types'
import type { AspectRatio } from './AspectRatioToggle'

interface MapDefaults {
  mapStyle?: string
  mapOpacity?: number
  pinColor?: string
  pinRadius?: number
  highlightCountry?: string
  highlightColor?: string
  mapPalette?: MapPalette
  mapFontstack?: string[]
}

interface StoryData {
  slug: string
  title: string
  vertical: string | null
  theme: Theme
  defaults: MapDefaults
  units: ResolvedUnit[]
}

interface StoryOption {
  slug: string
  title: string
}

interface AssetEntry {
  url: string
  filename: string
  contentType: string | null
}

const PREVIEW_MAX_W = 380
const PREVIEW_MAX_H = 560

const TEMPLATES: Array<{ id: TemplateKind; label: string }> = [
  { id: 'map-caption', label: 'Map + caption' },
  { id: 'data', label: 'Story data' },
  { id: 'title-text', label: 'Title / text' },
]

const UMAMI_TEMPLATES: Array<{ id: TemplateKind; label: string }> = [
  { id: 'umami-compare', label: 'Comparison (X vs Y)' },
  { id: 'umami-dish', label: 'Dish spotlight' },
  { id: 'umami-hook', label: 'Hook frame' },
  { id: 'umami-story', label: 'Story frame' },
  { id: 'umami-closing', label: 'Closing frame' },
]

/** The explainer-carousel default frame sequence ("New carousel"). */
const UMAMI_CAROUSEL_SEED: UmamiTemplateKind[] = ['umami-hook', 'umami-story', 'umami-closing']

/** A carousel frame parked outside the live editor. The ACTIVE frame lives in
 *  the ordinary composition/templateKind state; switching frames stashes it
 *  back here. `cardId` links to the saved row (null until first save). */
interface CarouselFrame {
  localId: string
  cardId: string | null
  kind: TemplateKind
  composition: CardComposition
}

interface CarouselState {
  id: string
  name: string | null
  frames: CarouselFrame[]
}

const EMPTY_STYLES: never[] = []

const CONTAINED_FOCUS = { top: 0, left: 0, width: 1, height: 1 }

type EditorTab = 'setup' | 'theme' | 'background' | 'elements' | 'text'
const TABS: Array<{ id: EditorTab; label: string; Icon: PhosphorIcon }> = [
  { id: 'setup', label: 'Canvas & story', Icon: FrameCorners },
  { id: 'theme', label: 'Theme', Icon: Palette },
  { id: 'background', label: 'Background', Icon: ImageIcon },
  { id: 'elements', label: 'Foreground · graphics & elements', Icon: Stack },
  { id: 'text', label: 'Text', Icon: TextT },
]

/** Neutral editorial theme used when composing from scratch (no story). System
 *  font stacks so no font import is needed. */
const DEFAULT_THEME: Theme = {
  colors: {
    background: '#f4efe6',
    text: '#1a1a1a',
    accent: '#d85a30',
    accent2: '#3a6ea5',
    teal: '#3a9e8c',
    surface: '#e7dfd0',
    muted: '#6b6b6b',
    positive: '#3a9e8c',
    amber: '#e0a93a',
    red: '#c0392b',
  },
  fonts: {
    serif: 'Georgia',
    sans: '-apple-system, "Segoe UI", Helvetica',
    mono: 'ui-monospace, Menlo',
  },
}

/** A placeholder unit for blank-canvas mode — no map/chart data, no copy. */
const BLANK_UNIT: ResolvedUnit = {
  parentIndex: 0,
  subIndex: 0,
  parentConfig: { kind: 'text' } as StorySectionConfig,
  heading: undefined,
  subheading: undefined,
  paragraphs: [],
}

const blankComposition = (): CardComposition => ({
  // No explicit fill — the card's base `--color-bg` (from the theme) shows
  // through, so picking a theme/preset recolors the whole canvas. The user can
  // still drop in a solid/gradient/image/map fill from the Background tab.
  background: { kind: 'none' },
  elements: [],
  text: { annotations: [] },
  branding: { visible: true },
})

function defaultTemplate(unit: ResolvedUnit): TemplateKind {
  const s = detectSupport(unit)
  if (s.hasMap) return 'map-caption'
  if (s.chartId) return 'data'
  return 'title-text'
}

export function ShareCardCreator({
  stories,
  accessToken,
  mode = 'vizmaya',
}: {
  stories: StoryOption[]
  accessToken: string
  /** `umami` switches the composer into the umami "Social frames" mode: umami
   *  templates + paper/spice palettes, app-scoped saved cards, dish grounding,
   *  food AI-style presets and the explainer-carousel frame strip. */
  mode?: 'vizmaya' | 'umami'
}) {
  const isUmami = mode === 'umami'
  const blankTheme = isUmami ? UMAMI_PAPER : DEFAULT_THEME

  // Default to a blank canvas (slug ''); the user can attach a story after.
  const [slug, setSlug] = useState<string>('')
  const [story, setStory] = useState<StoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ratio, setRatio] = useState<AspectRatio>(isUmami ? '1:1' : '4:5')
  const [unitIdx, setUnitIdx] = useState<number>(0)
  const [templateKind, setTemplateKind] = useState<TemplateKind>(isUmami ? 'umami-compare' : 'map-caption')
  const [composition, setComposition] = useState<CardComposition | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  // Ungrouped element ids ticked (panel checkbox or canvas shift/⌘-click) to form
  // a new group. Cleared on group / tab switch.
  const [multiSel, setMultiSel] = useState<string[]>([])
  // While rotating a group, the live AABB (over orbiting centers) wobbles; freeze
  // the overlay to the gesture's start box so the dashed frame + handle stay put.
  const [frozenGroupBox, setFrozenGroupBox] = useState<GroupBBox | null>(null)

  const [assets, setAssets] = useState<AssetEntry[]>([])
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [saving, setSaving] = useState(false)
  const [currentCardId, setCurrentCardId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  // Map-edit overlay state.
  const [mapEditOpen, setMapEditOpen] = useState(false)
  const [mapEditSel, setMapEditSel] = useState<Selection | null>(null)
  const [mapEditSeed, setMapEditSeed] = useState<MapView | null>(null)

  // A saved card to apply once its story + unit resolve.
  const pendingLoadRef = useRef<{ snapshot: AnyShareCardSnapshot } | null>(null)
  const pendingUnitRef = useRef<{ parentIndex: number; subIndex: number } | null>(null)
  // When attaching a story to a from-scratch card, preserve the composition
  // (load the story's theme + sections without re-seeding a template).
  const attachKeepRef = useRef(false)

  const cardRef = useRef<ShareCardHandle>(null)

  const units = useMemo(() => story?.units ?? [], [story])
  // Always have a unit (blank canvas uses a placeholder) so the card renders.
  const selectedUnit = units[unitIdx] ?? BLANK_UNIT

  // Resolve a loaded snapshot (v1 migrated, v2 direct) against a story+unit.
  const applyLoadedSnapshot = useCallback(
    (storyData: StoryData, snap: AnyShareCardSnapshot, useRatio: AspectRatio) => {
      const idx = storyData.units.findIndex(
        (u) => u.parentIndex === snap.parentIndex && u.subIndex === snap.subIndex,
      )
      const resolvedIdx = idx >= 0 ? idx : 0
      setUnitIdx(resolvedIdx)
      const unit = storyData.units[resolvedIdx] ?? BLANK_UNIT
      try {
        if (snapshotVersion(snap) === 2) {
          // v2 carries the full composition — no unit needed (works for blank cards).
          // `normalizeComposition` folds any legacy single hero into an element.
          const v2 = snap as VizmayaShareCardSnapshotV2
          setComposition(normalizeComposition(v2.composition))
          setTemplateKind(v2.templateKind)
        } else {
          const v1 = snap as Extract<AnyShareCardSnapshot, { version: 1 }>
          const kind = templateKindFromV1(v1)
          setComposition(applyV1Overrides(seedTemplate(kind, unit, storyData, useRatio), v1))
          setTemplateKind(kind)
        }
        setSelection(null)
        setMultiSel([])
      } catch (e) {
        setError(e instanceof Error ? `Couldn't load card: ${e.message}` : "Couldn't load this card (older format).")
      }
    },
    [],
  )

  // ── load the selected story ───────────────────────────────────────────────
  useEffect(() => {
    if (!slug) {
      // Blank canvas: synthesize a story with the default theme + no units.
      // Umami mode starts on the paper palette with a designed frame seeded
      // (vs. vizmaya's empty canvas) and tags the umami vertical so the
      // branding footer shows the umami wordmark.
      const blank: StoryData = {
        slug: '',
        title: 'Untitled',
        vertical: isUmami ? 'umami' : null,
        theme: blankTheme,
        defaults: {},
        units: [],
      }
      setStory(blank)
      setUnitIdx(0)
      setError(null)
      setLoading(false)
      const load = pendingLoadRef.current
      if (load) {
        // A saved card composed from scratch (no story) reopening.
        applyLoadedSnapshot(blank, load.snapshot, ratio)
      } else if (!attachKeepRef.current) {
        if (isUmami) {
          setComposition(seedUmamiTemplate('umami-compare', blankTheme, ratio))
          setTemplateKind('umami-compare')
        } else {
          setComposition(blankComposition())
          setTemplateKind('title-text')
        }
        setSelection(null)
      }
      pendingLoadRef.current = null
      pendingUnitRef.current = null
      attachKeepRef.current = false
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch(`/api/vizmaya/share-cards/stories/${encodeURIComponent(slug)}`)
        const body = (await res.json().catch(() => ({}))) as (StoryData & { ok?: boolean }) | { error?: string }
        if (!res.ok || !('ok' in body) || !body.ok) {
          throw new Error(('error' in body && body.error) || `HTTP ${res.status}`)
        }
        if (!alive) return
        setStory(body)
        const load = pendingLoadRef.current
        if (load) {
          applyLoadedSnapshot(body, load.snapshot, ratio)
        } else if (attachKeepRef.current) {
          // Attaching this story to a from-scratch card — adopt its theme +
          // sections but keep the user's existing composition.
          setUnitIdx(0)
          setSelection(null)
        } else {
          const pendingUnit = pendingUnitRef.current
          const idx = pendingUnit
            ? body.units.findIndex((u) => u.parentIndex === pendingUnit.parentIndex && u.subIndex === pendingUnit.subIndex)
            : 0
          const resolvedIdx = idx >= 0 ? idx : 0
          setUnitIdx(resolvedIdx)
          const unit = body.units[resolvedIdx]
          if (unit) {
            const kind = defaultTemplate(unit)
            setTemplateKind(kind)
            setComposition(seedTemplate(kind, unit, body, ratio))
            setSelection(null)
          }
        }
        pendingLoadRef.current = null
        pendingUnitRef.current = null
        attachKeepRef.current = false
      } catch (e) {
        if (alive) {
          setStory(null)
          setComposition(null)
          setError(e instanceof Error ? e.message : 'Failed to load story')
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // ── story image assets ──────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) {
      setAssets([])
      return
    }
    let alive = true
    void (async () => {
      try {
        const res = await fetch(`/api/stories/${encodeURIComponent(slug)}/assets`)
        const body = (await res.json().catch(() => ({}))) as { assets?: AssetEntry[] }
        if (alive) {
          setAssets(
            (body.assets ?? []).filter(
              (a) => (a.contentType ?? '').startsWith('image/') || /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(a.filename),
            ),
          )
        }
      } catch {
        if (alive) setAssets([])
      }
    })()
    return () => {
      alive = false
    }
  }, [slug])

  // ── saved-card library (app-scoped: umami sees only umami rows, the vizmaya
  //    composer only legacy null-scoped rows) ────────────────────────────────
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch(`/api/vizmaya/share-cards/cards${isUmami ? '?appSlug=umami' : ''}`)
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; cards?: SavedCard[] }
        if (alive && body.ok) setSavedCards(body.cards ?? [])
      } catch {
        /* non-fatal */
      }
    })()
    return () => {
      alive = false
    }
  }, [isUmami])

  // The theme the card actually renders with: a per-card override (set in the
  // Theme panel) wins, else the attached story's theme, else the default
  // editorial theme for a blank canvas.
  const effectiveTheme = composition?.theme ?? story?.theme ?? blankTheme

  // Import web fonts for whatever the effective theme uses; system stacks
  // resolve to null (no request). Covers story fonts AND from-scratch overrides.
  const fontImportUrl = useMemo(() => getFontImportUrl(effectiveTheme.fonts), [effectiveTheme])

  // ── reset path: section / template change re-seed section-bound slots,
  //    preserving user-added elements + branding (single policy). ──────────────
  const pickUnit = useCallback(
    (idx: number) => {
      setUnitIdx(idx)
      setSelection(null)
      const unit = units[idx]
      if (!unit || !story) return
      const kind = defaultTemplate(unit)
      setTemplateKind(kind)
      setComposition((prev) => {
        const seed = seedTemplate(kind, unit, story, ratio)
        // Re-seed the section graphic (stable id) but keep the user's own
        // added elements + branding + groups, and any per-card theme override.
        return prev
          ? {
              ...seed,
              elements: [...seed.elements, ...prev.elements.filter((e) => e.id !== SEED_GRAPHIC_ID)],
              groups: prev.groups,
              branding: prev.branding,
              theme: prev.theme,
            }
          : seed
      })
    },
    [units, story, ratio],
  )

  // Merge a fresh umami seed over the previous composition: seed slots whose
  // stable `seed-*` id already exists keep the PREVIOUS layer (so a generated
  // image or a hand-moved slot survives a re-seed), new seed slots come in
  // fresh, and the user's own added layers / groups / branding carry over.
  const mergeUmamiSeed = useCallback(
    (seed: CardComposition, prev: CardComposition | null): CardComposition => {
      if (!prev) return seed
      const prevById = new Map(prev.elements.map((e) => [e.id, e]))
      return {
        ...seed,
        elements: [
          ...seed.elements.map((e) => (prevById.has(e.id) ? prevById.get(e.id)! : e)),
          ...prev.elements.filter((e) => !e.id.startsWith('seed-')),
        ],
        groups: prev.groups,
        branding: prev.branding,
      }
    },
    [],
  )

  const pickTemplate = useCallback(
    (kind: TemplateKind) => {
      setTemplateKind(kind)
      setSelection(null)
      if (isUmamiKind(kind)) {
        // Umami templates seed from the effective theme, not a story section.
        // A template switch replaces every seed slot (text included), so pass
        // no prev-slot carry-over for elements that changed identity.
        setComposition((prev) => {
          const theme = prev?.theme ?? story?.theme ?? blankTheme
          const seed = seedUmamiTemplate(kind, theme, ratio)
          return prev
            ? {
                ...seed,
                elements: [...seed.elements, ...prev.elements.filter((e) => !e.id.startsWith('seed-'))],
                groups: prev.groups,
                branding: prev.branding,
              }
            : seed
        })
        return
      }
      if (!selectedUnit || !story) return
      setComposition((prev) => {
        const seed = seedTemplate(kind, selectedUnit, story, ratio)
        // Re-seed the section graphic (stable id) but keep the user's own
        // added elements + branding + groups, and any per-card theme override.
        return prev
          ? {
              ...seed,
              elements: [...seed.elements, ...prev.elements.filter((e) => e.id !== SEED_GRAPHIC_ID)],
              groups: prev.groups,
              branding: prev.branding,
              theme: prev.theme,
            }
          : seed
      })
    },
    [selectedUnit, story, ratio, blankTheme],
  )

  // ── umami: dish grounding + paper/spice toggle ────────────────────────────
  const [dishPicks, setDishPicks] = useState<{ a?: UmamiDishLite; b?: UmamiDishLite; spotlight?: UmamiDishLite }>({})

  // Re-seed the current umami frame with dish content (labels, name, blurb,
  // rating). Seed image slots keep any generated/uploaded imagery via the
  // stable-id merge.
  const applyUmamiContent = useCallback(
    (content: UmamiSeedContent) => {
      if (!isUmamiKind(templateKind)) return
      setComposition((prev) => {
        const theme = prev?.theme ?? blankTheme
        return mergeUmamiSeed(seedUmamiTemplate(templateKind, theme, ratio, content), prev)
      })
    },
    [templateKind, ratio, blankTheme, mergeUmamiSeed],
  )

  const pickDish = useCallback(
    (slot: 'a' | 'b' | 'spotlight', dish: UmamiDishLite) => {
      const next = { ...dishPicks, [slot]: dish }
      setDishPicks(next)
      if (templateKind === 'umami-compare') {
        applyUmamiContent({ dishA: next.a, dishB: next.b })
      } else if (templateKind === 'umami-dish') {
        applyUmamiContent({ dish: next.spotlight })
      }
    },
    [dishPicks, templateKind, applyUmamiContent],
  )

  // Which umami palette the card is currently on (null when hand-customized —
  // the toggle then remaps from the nearest look, leaving custom hexes alone).
  const activeUmamiTheme: UmamiThemeName = umamiThemeName(effectiveTheme) ?? 'paper'
  const setUmamiTheme = useCallback(
    (name: UmamiThemeName) => {
      if (name === activeUmamiTheme) return
      setComposition((prev) =>
        prev ? remapCompositionTheme(prev, UMAMI_THEMES[activeUmamiTheme], UMAMI_THEMES[name]) : prev,
      )
    },
    [activeUmamiTheme],
  )

  const pickStory = useCallback(
    (nextSlug: string) => {
      setCurrentCardId(null)
      pendingLoadRef.current = null
      pendingUnitRef.current = null
      // Attaching a story to a from-scratch card (blank → story) keeps the
      // current layers; switching between stories re-seeds a template.
      attachKeepRef.current = slug === '' && nextSlug !== ''
      setSlug(nextSlug)
    },
    [slug],
  )

  // ── map edit overlay ────────────────────────────────────────────────────
  const mapSpecForSelection = useCallback(
    (sel: Selection): MapSpec | null => {
      if (!composition) return null
      if (sel.kind === 'background' && composition.background.kind === 'map') return composition.background
      if (sel.kind === 'element') {
        const el = composition.elements.find((e) => e.id === sel.id)
        if (el?.kind === 'map') return el
      }
      return null
    },
    [composition],
  )

  const onEditMap = useCallback(
    (sel: Selection) => {
      const spec = mapSpecForSelection(sel)
      setMapEditSel(sel)
      setMapEditSeed(spec ? cardRef.current?.getMapView(spec) ?? null : null)
      setMapEditOpen(true)
    },
    [mapSpecForSelection],
  )

  const applyMapView = useCallback(
    (view: MapView) => {
      const sel = mapEditSel
      if (!sel) return
      setComposition((prev) => {
        if (!prev) return prev
        if (sel.kind === 'background' && prev.background.kind === 'map') {
          return { ...prev, background: { ...prev.background, camera: { ...prev.background.camera, [ratio]: view } } }
        }
        if (sel.kind === 'element') {
          return {
            ...prev,
            elements: prev.elements.map((e) =>
              e.id === sel.id && e.kind === 'map' ? { ...e, camera: { ...e.camera, [ratio]: view } } : e,
            ),
          }
        }
        return prev
      })
      setMapEditOpen(false)
    },
    [mapEditSel, ratio],
  )

  // Close the map-edit overlay if its target slot/element disappears (e.g. the
  // element was deleted or the slot's kind changed while the modal was open) —
  // otherwise applyMapView would silently no-op and lose the edit.
  useEffect(() => {
    if (mapEditOpen && mapEditSel && !mapSpecForSelection(mapEditSel)) setMapEditOpen(false)
  }, [mapEditOpen, mapEditSel, mapSpecForSelection])

  // ── preview sizing ────────────────────────────────────────────────────────
  // The canvas fills the available center column (measured), so it grows to the
  // viewport height instead of a fixed 380×560 box.
  const { w: renderW, h: renderH } = RENDER_SIZE[ratio]
  const previewBoxRef = useRef<HTMLDivElement>(null)
  const [previewBox, setPreviewBox] = useState<{ w: number; h: number }>({ w: PREVIEW_MAX_W, h: PREVIEW_MAX_H })
  useEffect(() => {
    const el = previewBoxRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r && r.width > 0 && r.height > 0) setPreviewBox({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const previewScale = Math.max(0.1, Math.min(previewBox.w / renderW, previewBox.h / renderH))

  // ── left icon-rail tabs ───────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<EditorTab>('setup')
  const selectTab = useCallback((t: EditorTab) => {
    setActiveTab(t)
    setMultiSel([])
    // Keep the canvas selection in step with the tab so the right editor shows.
    if (t === 'background') setSelection({ kind: 'background' })
    else setSelection(null)
  }, [])

  // ── saved-cards dropdown (top bar) ────────────────────────────────────────
  const [savedOpen, setSavedOpen] = useState(false)
  const savedRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!savedOpen) return
    const onDown = (e: PointerEvent) => {
      if (savedRef.current && !savedRef.current.contains(e.target as Node)) setSavedOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [savedOpen])

  // ── drag layers on the preview ──────────────────────────────────────────
  const interactionRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Selection | null>(null)
  const moveLayer = useCallback((sel: Selection, xPct: number, yPct: number) => {
    setComposition((prev) => {
      if (!prev) return prev
      if (sel.kind === 'text' || sel.kind === 'annotation') {
        const cur = getSelectedText(prev, sel)
        if (!cur) return prev
        return patchSelectedText(prev, sel, { transform: { ...cur.transform, xPct, yPct } })
      }
      if (sel.kind === 'element') return patchElementTransform(prev, sel.id, { xPct, yPct })
      return prev
    })
  }, [])

  const onLayerPointerDown = useCallback(
    (e: ReactPointerEvent, sel: Selection) => {
      e.preventDefault()
      e.stopPropagation()
      setSelection(sel)
      // Open the matching tab so the editor for the clicked layer is visible.
      const tabFor: EditorTab | null =
        sel.kind === 'element'
          ? 'elements'
          : sel.kind === 'text' || sel.kind === 'annotation'
            ? 'text'
            : sel.kind === 'background'
              ? 'background'
              : null
      if (tabFor) setActiveTab(tabFor)
      dragRef.current = sel
      const move = (ev: PointerEvent) => {
        const el = interactionRef.current
        if (!dragRef.current || !el) return
        const rect = el.getBoundingClientRect()
        const xPct = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100))
        const yPct = Math.min(100, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100))
        moveLayer(dragRef.current, xPct, yPct)
      }
      const end = () => {
        dragRef.current = null
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
    },
    [moveLayer],
  )

  // ── group transforms (move / resize / rotate as a unit) ───────────────────
  // Each handler captures the composition at pointer-down and recomputes the
  // whole group from that start snapshot on every move, so there's no drift.
  const toggleMultiSel = useCallback((id: string) => {
    setMultiSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const startGroupMove = useCallback(
    (gid: string, e: ReactPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const start = composition
      const rect = interactionRef.current?.getBoundingClientRect()
      if (!start || !rect) return
      const sx = e.clientX
      const sy = e.clientY
      const move = (ev: PointerEvent) => {
        const dxPct = ((ev.clientX - sx) / rect.width) * 100
        const dyPct = ((ev.clientY - sy) / rect.height) * 100
        setComposition(moveGroupBy(start, gid, dxPct, dyPct))
      }
      const end = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
    },
    [composition],
  )

  const startGroupScale = useCallback(
    (gid: string, corner: number, e: ReactPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const start = composition
      const rect = interactionRef.current?.getBoundingClientRect()
      if (!start || !rect) return
      const bb = groupBBox(start.elements, gid, renderW, renderH)
      if (!bb) return
      // Corner order: 0 TL, 1 TR, 2 BR, 3 BL. Drag a corner, the opposite stays put.
      const corners = [
        { x: bb.left, y: bb.top },
        { x: bb.right, y: bb.top },
        { x: bb.right, y: bb.bottom },
        { x: bb.left, y: bb.bottom },
      ]
      const pivot = corners[(corner + 2) % 4]
      const handle = corners[corner]
      const toPx = (p: { x: number; y: number }) => ({
        x: rect.left + (p.x / 100) * rect.width,
        y: rect.top + (p.y / 100) * rect.height,
      })
      const pivotPx = toPx(pivot)
      const handlePx = toPx(handle)
      const startLen = Math.hypot(handlePx.x - pivotPx.x, handlePx.y - pivotPx.y) || 1
      const move = (ev: PointerEvent) => {
        const k = Math.hypot(ev.clientX - pivotPx.x, ev.clientY - pivotPx.y) / startLen
        setComposition(scaleGroupAround(start, gid, k, pivot.x, pivot.y, renderW, renderH))
      }
      const end = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
    },
    [composition, renderW, renderH],
  )

  const startGroupRotate = useCallback(
    (gid: string, e: ReactPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const start = composition
      const rect = interactionRef.current?.getBoundingClientRect()
      if (!start || !rect) return
      const bb = groupBBox(start.elements, gid, renderW, renderH)
      if (!bb) return
      const center = { x: rect.left + (bb.cx / 100) * rect.width, y: rect.top + (bb.cy / 100) * rect.height }
      const a0 = Math.atan2(e.clientY - center.y, e.clientX - center.x)
      setFrozenGroupBox(bb)
      const move = (ev: PointerEvent) => {
        const a1 = Math.atan2(ev.clientY - center.y, ev.clientX - center.x)
        const deg = ((a1 - a0) * 180) / Math.PI
        setComposition(rotateGroupAround(start, gid, deg, bb.cx, bb.cy, renderW, renderH))
      }
      const end = () => {
        setFrozenGroupBox(null)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
    },
    [composition, renderW, renderH],
  )

  // Pointer-down on an element hit-box: shift/⌘ ticks ungrouped items for
  // grouping; a plain click on a grouped element selects + drags the whole group;
  // otherwise it's a single-element drag (incl. an already-selected member).
  const onElementPointerDown = useCallback(
    (e: ReactPointerEvent, elId: string, groupId: string | undefined) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        e.preventDefault()
        e.stopPropagation()
        if (!groupId) toggleMultiSel(elId)
        return
      }
      const alreadySingle = selection?.kind === 'element' && selection.id === elId
      if (groupId && !alreadySingle) {
        setSelection({ kind: 'group', id: groupId })
        setActiveTab('elements')
        startGroupMove(groupId, e)
        return
      }
      onLayerPointerDown(e, { kind: 'element', id: elId })
    },
    [selection, toggleMultiSel, startGroupMove, onLayerPointerDown],
  )

  // Build the draggable hit targets from the composition.
  interface Draggable {
    key: string
    sel: Selection
    t: Transform
    heightPx?: number
    elId?: string
    groupId?: string
  }
  const draggables = useMemo<Draggable[]>(() => {
    if (!composition) return []
    const out: Draggable[] = []
    const c = composition
    if (c.text.heading?.visible)
      out.push({ key: 'heading', sel: { kind: 'text', which: 'heading' }, t: c.text.heading.transform, heightPx: c.text.heading.style.fontSizePx * c.text.heading.style.lineHeight * 1.8 })
    if (c.text.subheading?.visible)
      out.push({ key: 'subheading', sel: { kind: 'text', which: 'subheading' }, t: c.text.subheading.transform, heightPx: c.text.subheading.style.fontSizePx * c.text.subheading.style.lineHeight * 1.8 })
    for (const a of c.text.annotations)
      if (a.visible) out.push({ key: a.id, sel: { kind: 'annotation', id: a.id }, t: a.transform, heightPx: a.style.fontSizePx * a.style.lineHeight * 2.2 })
    // Graphic elements (chart/map/box-image) carry a heightPct → give the hit-box
    // a matching height; decorations stay square.
    for (const el of c.elements)
      if (el.visible)
        out.push({
          key: el.id,
          sel: { kind: 'element', id: el.id },
          t: el.transform,
          heightPx: el.transform.heightPct != null ? (el.transform.heightPct / 100) * renderH : undefined,
          elId: el.id,
          groupId: el.groupId,
        })
    return out
  }, [composition, renderH])

  // Live bounding box for the selected group's transform handles. During a rotate
  // gesture the live AABB wobbles, so prefer the frozen start box while it's set.
  const liveGroupBox = useMemo(
    () => (composition && selection?.kind === 'group' ? groupBBox(composition.elements, selection.id, renderW, renderH) : null),
    [composition, selection, renderW, renderH],
  )
  const groupBox = frozenGroupBox ?? liveGroupBox

  // ── capture / download ────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const dataUrl = await cardRef.current.capture()
      if (!dataUrl) return
      const link = document.createElement('a')
      link.download = `${slug || (isUmami ? 'umami' : 'vizmaya')}-${ratio.replace(':', 'x')}.png`
      link.href = dataUrl
      link.click()
    } finally {
      setDownloading(false)
    }
  }, [slug, ratio, isUmami])

  // ── save / load / delete ──────────────────────────────────────────────────
  const buildSnapshot = useCallback((): VizmayaShareCardSnapshotV2 | null => {
    if (!composition || !selectedUnit) return null
    return {
      version: 2,
      storySlug: slug || null,
      ratio,
      parentIndex: selectedUnit.parentIndex,
      subIndex: selectedUnit.subIndex,
      templateKind,
      composition,
    }
  }, [composition, slug, ratio, selectedUnit, templateKind])

  // POST a brand-new card row and return it (shared by first-save + duplicate +
  // carousel frames). Umami rows carry `appSlug`; carousel frames additionally
  // link via `carouselId` + `carouselPosition`.
  const createCard = useCallback(
    async (
      name: string,
      snapshot: VizmayaShareCardSnapshotV2,
      carouselRef?: { carouselId: string; carouselPosition: number },
    ): Promise<SavedCard> => {
      const res = await fetch('/api/vizmaya/share-cards/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          storySlug: slug,
          baseType: composeBaseType(snapshot.composition),
          ratio,
          config: snapshot,
          appSlug: isUmami ? 'umami' : null,
          ...(carouselRef ?? {}),
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; card?: SavedCard; error?: string }
      if (!res.ok || !body.ok || !body.card) throw new Error(body.error ?? `HTTP ${res.status}`)
      return body.card
    },
    [slug, ratio, isUmami],
  )

  const handleSave = useCallback(async () => {
    if (!story || !selectedUnit || !composition) return
    const snapshot = buildSnapshot()
    if (!snapshot) return

    // Already-saved card → update it in place (keep its name, no prompt).
    if (currentCardId) {
      const existing = savedCards.find((c) => c.id === currentCardId)
      setSaving(true)
      try {
        const res = await fetch(`/api/vizmaya/share-cards/cards/${currentCardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: existing?.name,
            storySlug: slug,
            baseType: composeBaseType(composition),
            ratio,
            config: snapshot,
          }),
        })
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; card?: SavedCard; error?: string }
        if (!res.ok || !body.ok || !body.card) throw new Error(body.error ?? `HTTP ${res.status}`)
        setSavedCards((prev) => prev.map((c) => (c.id === body.card!.id ? body.card! : c)))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSaving(false)
      }
      return
    }

    // New card → name it and create a row.
    const fallback = `${story.title} · ${[...TEMPLATES, ...UMAMI_TEMPLATES].find((t) => t.id === templateKind)?.label ?? templateKind}`
    const name = window.prompt('Name this card', fallback)?.trim()
    if (!name) return
    setSaving(true)
    try {
      const card = await createCard(name, snapshot)
      setSavedCards((prev) => [card, ...prev])
      setCurrentCardId(card.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [story, selectedUnit, composition, buildSnapshot, currentCardId, savedCards, createCard, templateKind, slug, ratio])

  // Duplicate the loaded card as a new "… copy" and make the copy the active card,
  // leaving the original untouched.
  const handleDuplicate = useCallback(async () => {
    if (!story || !selectedUnit || !composition || !currentCardId) return
    const snapshot = buildSnapshot()
    if (!snapshot) return
    const base = savedCards.find((c) => c.id === currentCardId)?.name ?? story.title
    setSaving(true)
    try {
      const card = await createCard(`${base} copy`, snapshot)
      setSavedCards((prev) => [card, ...prev])
      setCurrentCardId(card.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Duplicate failed')
    } finally {
      setSaving(false)
    }
  }, [story, selectedUnit, composition, currentCardId, buildSnapshot, savedCards, createCard])

  const loadCard = useCallback(
    (card: SavedCard) => {
      const snap = card.config
      setCurrentCardId(card.id)
      setError(null)
      setRatio(snap.ratio as AspectRatio)
      // Blank-canvas cards store `storySlug: null` while the synthesized blank
      // story carries slug '' — normalize both so a from-scratch card applies
      // immediately instead of staging a load the slug effect never consumes.
      if (story && (story.slug || null) === (snap.storySlug ?? null)) {
        // Same story already loaded — apply now.
        applyLoadedSnapshot(story, snap, snap.ratio as AspectRatio)
      } else {
        // Different story, OR the same story still loading — stage the snapshot
        // for the load effect to consume once the story+unit resolve.
        pendingLoadRef.current = { snapshot: snap }
        pendingUnitRef.current = { parentIndex: snap.parentIndex, subIndex: snap.subIndex }
        if (snap.storySlug && snap.storySlug !== slug) setSlug(snap.storySlug)
      }
    },
    [slug, story, applyLoadedSnapshot],
  )

  const handleDeleteSaved = useCallback(async (id: string) => {
    setSavedCards((prev) => prev.filter((c) => c.id !== id))
    setCurrentCardId((cur) => (cur === id ? null : cur))
    try {
      await fetch(`/api/vizmaya/share-cards/cards/${id}`, { method: 'DELETE' })
    } catch {
      /* optimistic */
    }
  }, [])

  // ── umami explainer carousel: an ordered strip of frames, one live in the
  //    editor at a time. Frames persist as ordinary card rows linked by
  //    `carouselId` + `carouselPosition` (ids double as the social planner's
  //    `share_card_carousel.cardIds[]`). ──────────────────────────────────────
  const [carousel, setCarousel] = useState<CarouselState | null>(null)
  const [activeFrameIdx, setActiveFrameIdx] = useState(0)
  const [exportingAll, setExportingAll] = useState(false)

  const loadFrameIntoEditor = useCallback((frame: CarouselFrame) => {
    setComposition(normalizeComposition(frame.composition))
    setTemplateKind(frame.kind)
    setSelection(null)
    setMultiSel([])
  }, [])

  /** The carousel's frames with the LIVE editor state stashed into the active
   *  slot — every carousel operation starts from this. */
  const framesWithActiveStashed = useCallback((): CarouselFrame[] | null => {
    if (!carousel || !composition) return null
    const frames = carousel.frames.slice()
    const cur = frames[activeFrameIdx]
    if (cur) frames[activeFrameIdx] = { ...cur, kind: templateKind, composition }
    return frames
  }, [carousel, composition, activeFrameIdx, templateKind])

  const startCarousel = useCallback(() => {
    const theme = effectiveTheme
    const frames: CarouselFrame[] = UMAMI_CAROUSEL_SEED.map((kind) => ({
      localId: crypto.randomUUID(),
      cardId: null,
      kind,
      composition: seedUmamiTemplate(kind, theme, ratio),
    }))
    setCarousel({ id: crypto.randomUUID(), name: null, frames })
    setActiveFrameIdx(0)
    setCurrentCardId(null)
    loadFrameIntoEditor(frames[0])
  }, [effectiveTheme, ratio, loadFrameIntoEditor])

  const exitCarousel = useCallback(() => {
    setCarousel(null)
    setActiveFrameIdx(0)
  }, [])

  const switchFrame = useCallback(
    (idx: number) => {
      const frames = framesWithActiveStashed()
      if (!carousel || !frames || idx === activeFrameIdx || !frames[idx]) return
      setCarousel({ ...carousel, frames })
      setActiveFrameIdx(idx)
      loadFrameIntoEditor(frames[idx])
    },
    [carousel, activeFrameIdx, framesWithActiveStashed, loadFrameIntoEditor],
  )

  const addFrame = useCallback(
    (kind: UmamiTemplateKind) => {
      const frames = framesWithActiveStashed()
      if (!carousel || !frames) return
      const theme = composition?.theme ?? blankTheme
      const frame: CarouselFrame = {
        localId: crypto.randomUUID(),
        cardId: null,
        kind,
        composition: seedUmamiTemplate(kind, theme, ratio),
      }
      const next = [...frames, frame]
      setCarousel({ ...carousel, frames: next })
      setActiveFrameIdx(next.length - 1)
      loadFrameIntoEditor(frame)
    },
    [carousel, composition, blankTheme, ratio, framesWithActiveStashed, loadFrameIntoEditor],
  )

  const duplicateFrame = useCallback(() => {
    const frames = framesWithActiveStashed()
    if (!carousel || !frames) return
    const src = frames[activeFrameIdx]
    const copy: CarouselFrame = { ...src, localId: crypto.randomUUID(), cardId: null }
    const next = [...frames.slice(0, activeFrameIdx + 1), copy, ...frames.slice(activeFrameIdx + 1)]
    setCarousel({ ...carousel, frames: next })
    setActiveFrameIdx(activeFrameIdx + 1)
    loadFrameIntoEditor(copy)
  }, [carousel, activeFrameIdx, framesWithActiveStashed, loadFrameIntoEditor])

  const deleteFrame = useCallback(
    (idx: number) => {
      const frames = framesWithActiveStashed()
      if (!carousel || !frames || frames.length <= 1) return
      const removed = frames[idx]
      const next = frames.filter((_, i) => i !== idx)
      const nextActive = idx < activeFrameIdx ? activeFrameIdx - 1 : Math.min(activeFrameIdx, next.length - 1)
      setCarousel({ ...carousel, frames: next })
      setActiveFrameIdx(nextActive)
      loadFrameIntoEditor(next[nextActive])
      // Frame rows are cheap; delete a persisted one optimistically.
      if (removed?.cardId) {
        setSavedCards((prev) => prev.filter((c) => c.id !== removed.cardId))
        void fetch(`/api/vizmaya/share-cards/cards/${removed.cardId}`, { method: 'DELETE' }).catch(() => {})
      }
    },
    [carousel, activeFrameIdx, framesWithActiveStashed, loadFrameIntoEditor],
  )

  const moveFrame = useCallback(
    (idx: number, dir: -1 | 1) => {
      const frames = framesWithActiveStashed()
      if (!carousel || !frames) return
      const to = idx + dir
      if (to < 0 || to >= frames.length) return
      const next = frames.slice()
      ;[next[idx], next[to]] = [next[to], next[idx]]
      // Keep the active highlight following the frame the user is editing.
      const nextActive = activeFrameIdx === idx ? to : activeFrameIdx === to ? idx : activeFrameIdx
      setCarousel({ ...carousel, frames: next })
      setActiveFrameIdx(nextActive)
    },
    [carousel, activeFrameIdx, framesWithActiveStashed],
  )

  /** Persist the whole strip: one row per frame (POST new / PUT existing) with
   *  `carouselId` + `carouselPosition`. Row ids = the planner's cardIds[]. */
  const saveCarousel = useCallback(async () => {
    const frames = framesWithActiveStashed()
    if (!carousel || !frames) return
    let name = carousel.name
    if (!name) {
      name = window.prompt('Name this carousel', 'Umami carousel')?.trim() || ''
      if (!name) return
    }
    setSaving(true)
    try {
      const next: CarouselFrame[] = []
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]
        const snapshot: VizmayaShareCardSnapshotV2 = {
          version: 2,
          storySlug: null,
          ratio,
          parentIndex: 0,
          subIndex: 0,
          templateKind: f.kind,
          composition: f.composition,
        }
        const frameName = `${name} · ${i + 1}/${frames.length}`
        if (f.cardId) {
          const res = await fetch(`/api/vizmaya/share-cards/cards/${f.cardId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: frameName,
              storySlug: null,
              baseType: composeBaseType(f.composition),
              ratio,
              config: snapshot,
              carouselId: carousel.id,
              carouselPosition: i,
            }),
          })
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
          if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
          next.push(f)
        } else {
          const card = await createCard(frameName, snapshot, { carouselId: carousel.id, carouselPosition: i })
          next.push({ ...f, cardId: card.id })
        }
      }
      setCarousel({ id: carousel.id, name, frames: next })
      // Refresh the library so the grouped carousel shows up-to-date rows.
      const res = await fetch('/api/vizmaya/share-cards/cards?appSlug=umami')
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; cards?: SavedCard[] }
      if (body.ok) setSavedCards(body.cards ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [carousel, ratio, framesWithActiveStashed, createCard])

  /** Reopen a saved carousel from its grouped library rows. */
  const loadCarousel = useCallback(
    (groupId: string) => {
      const rows = savedCards
        .filter((c) => c.carouselId === groupId)
        .sort((a, b) => (a.carouselPosition ?? 0) - (b.carouselPosition ?? 0))
      if (rows.length === 0) return
      try {
        const frames: CarouselFrame[] = rows.map((r) => {
          const snap = r.config as VizmayaShareCardSnapshotV2
          return {
            localId: crypto.randomUUID(),
            cardId: r.id,
            kind: snap.templateKind,
            composition: normalizeComposition(snap.composition),
          }
        })
        const first = rows[0].config as VizmayaShareCardSnapshotV2
        setRatio(first.ratio as AspectRatio)
        setCarousel({ id: groupId, name: rows[0].name.replace(/\s·\s\d+\/\d+$/, ''), frames })
        setActiveFrameIdx(0)
        setCurrentCardId(null)
        setError(null)
        loadFrameIntoEditor(frames[0])
      } catch {
        setError("Couldn't load this carousel (older format).")
      }
    },
    [savedCards, loadFrameIntoEditor],
  )

  const deleteCarousel = useCallback(
    (groupId: string) => {
      const rows = savedCards.filter((c) => c.carouselId === groupId)
      setSavedCards((prev) => prev.filter((c) => c.carouselId !== groupId))
      for (const r of rows) {
        void fetch(`/api/vizmaya/share-cards/cards/${r.id}`, { method: 'DELETE' }).catch(() => {})
      }
      setCarousel((cur) => (cur?.id === groupId ? null : cur))
    },
    [savedCards],
  )

  /** Export every frame as an ordered PNG. Frames render through the ONE live
   *  card, so each iteration commits the frame synchronously (flushSync), waits
   *  two frames for paint, then captures — `capture()` itself gates on fonts +
   *  image decode. */
  const exportCarousel = useCallback(async () => {
    const frames = framesWithActiveStashed()
    if (!carousel || !frames || !cardRef.current) return
    setCarousel({ ...carousel, frames })
    const base = (carousel.name ?? 'carousel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'carousel'
    setExportingAll(true)
    try {
      for (let i = 0; i < frames.length; i++) {
        flushSync(() => {
          setActiveFrameIdx(i)
          loadFrameIntoEditor(frames[i])
        })
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        const dataUrl = await cardRef.current?.capture()
        if (dataUrl) {
          const link = document.createElement('a')
          link.download = `umami-${base}-${String(i + 1).padStart(2, '0')}.png`
          link.href = dataUrl
          link.click()
          // Small gap so the browser registers each download separately.
          await new Promise((resolve) => setTimeout(resolve, 350))
        }
      }
    } finally {
      setExportingAll(false)
    }
  }, [carousel, framesWithActiveStashed, loadFrameIntoEditor])

  // Grouped library view (umami): carousels as one entry each + loose singles.
  const savedCarouselGroups = useMemo(() => {
    if (!isUmami) return []
    const groups = new Map<string, SavedCard[]>()
    for (const c of savedCards) {
      if (!c.carouselId) continue
      const list = groups.get(c.carouselId) ?? []
      list.push(c)
      groups.set(c.carouselId, list)
    }
    return [...groups.entries()].map(([id, rows]) => ({
      id,
      rows: rows.sort((a, b) => (a.carouselPosition ?? 0) - (b.carouselPosition ?? 0)),
      name: rows[0]?.name.replace(/\s·\s\d+\/\d+$/, '') ?? 'Carousel',
    }))
  }, [isUmami, savedCards])
  const savedSingles = useMemo(() => savedCards.filter((c) => !c.carouselId), [savedCards])

  // ── render ──────────────────────────────────────────────────────────────
  const labelCls = 'block text-[11px] font-medium text-neutral-400'
  const selectCls =
    'mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30'

  const inspectorStory = story
    ? {
        slug: story.slug,
        theme: story.theme,
        assets,
        defaults: {
          mapStyle: story.defaults.mapStyle,
          mapOpacity: story.defaults.mapOpacity,
          pinColor: story.defaults.pinColor,
          pinRadius: story.defaults.pinRadius,
        },
      }
    : null

  const mapEditStyle = (() => {
    if (!mapEditSel) return story?.defaults.mapStyle
    const spec = mapSpecForSelection(mapEditSel)
    return spec?.appearance.mapStyle ?? story?.defaults.mapStyle
  })()
  const mapEditIsBackground = mapEditSel?.kind === 'background'

  // Seed for a "+ Chart" graphic: the current section's story chart id (if any).
  const defaultChartId = useMemo(() => detectSupport(selectedUnit).chartId ?? '', [selectedUnit])

  return (
    // Umami surfaces its food AI-style presets in every ImagePicker instance.
    <ExtraStyleTemplatesContext.Provider value={isUmami ? UMAMI_STYLE_TEMPLATES : EMPTY_STYLES}>
    <div className="flex h-full min-h-0 flex-col gap-3">
      {fontImportUrl && <link href={fontImportUrl} rel="stylesheet" />}

      {/* ── Top bar: title · saved cards · actions ─────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3">
        <h1 className="text-lg font-semibold text-neutral-100">{isUmami ? 'Social frames' : 'Share cards'}</h1>

        <div ref={savedRef} className="relative">
          <button
            onClick={() => setSavedOpen((o) => !o)}
            disabled={savedCards.length === 0}
            className="flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            Saved{savedCards.length > 0 ? ` · ${isUmami ? savedCarouselGroups.length + savedSingles.length : savedCards.length}` : ''}
            <span className="text-neutral-500">▾</span>
          </button>
          {savedOpen && savedCards.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-white/10 bg-neutral-900 p-1.5 shadow-xl">
              {savedCarouselGroups.map((g) => (
                <div
                  key={g.id}
                  className={`flex items-center gap-2 rounded-md border p-1.5 ${carousel?.id === g.id ? 'border-sky-400/50 bg-white/5' : 'border-transparent hover:bg-white/5'}`}
                >
                  <button
                    onClick={() => {
                      loadCarousel(g.id)
                      setSavedOpen(false)
                    }}
                    title="Load carousel into editor"
                    className="min-w-0 flex-1 truncate text-left text-[11px] text-neutral-200 hover:text-white"
                  >
                    {g.name}
                    <span className="ml-1 text-neutral-500">· {g.rows.length} frames</span>
                  </button>
                  <button
                    onClick={() => deleteCarousel(g.id)}
                    className="shrink-0 rounded px-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
                    aria-label="Delete saved carousel"
                  >
                    ×
                  </button>
                </div>
              ))}
              {(isUmami ? savedSingles : savedCards).map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 rounded-md border p-1.5 ${currentCardId === c.id ? 'border-sky-400/50 bg-white/5' : 'border-transparent hover:bg-white/5'}`}
                >
                  <button
                    onClick={() => {
                      if (carousel) exitCarousel()
                      loadCard(c)
                      setSavedOpen(false)
                    }}
                    title="Load into editor"
                    className="min-w-0 flex-1 truncate text-left text-[11px] text-neutral-200 hover:text-white"
                  >
                    {c.name}
                    <span className="ml-1 text-neutral-500">· {c.baseType}</span>
                  </button>
                  <button
                    onClick={() => void handleDeleteSaved(c.id)}
                    className="shrink-0 rounded px-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
                    aria-label="Delete saved card"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {isUmami && !carousel && (
          <button
            onClick={startCarousel}
            className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-white/10"
          >
            New carousel
          </button>
        )}
        {isUmami && carousel && (
          <button
            onClick={exitCarousel}
            title="Back to single-frame editing (unsaved carousel edits stay in memory only)"
            className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-white/10"
          >
            Exit carousel
          </button>
        )}

        <div className="flex-1" />

        {carousel ? (
          <button
            onClick={() => void exportCarousel()}
            disabled={!composition || exportingAll}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exportingAll ? 'Rendering…' : `Export ${carousel.frames.length} PNGs`}
          </button>
        ) : (
          <button
            onClick={() => void handleDownload()}
            disabled={!composition || downloading}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {downloading ? 'Rendering…' : 'Download PNG'}
          </button>
        )}
        <button
          onClick={() => void (carousel ? saveCarousel() : handleSave())}
          disabled={!composition || saving}
          className="rounded-md border border-white/15 px-3 py-1.5 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : carousel ? 'Save carousel' : 'Save'}
        </button>
        {!carousel && currentCardId && (
          <button
            onClick={() => void handleDuplicate()}
            disabled={!composition || saving}
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Duplicate
          </button>
        )}
      </div>

      {/* ── Carousel filmstrip (umami) ─────────────────────────────────────── */}
      {carousel && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto rounded-lg border border-white/10 bg-neutral-950/40 px-2 py-1.5">
          {carousel.frames.map((f, i) => {
            const label = UMAMI_TEMPLATES.find((t) => t.id === f.kind)?.label ?? f.kind
            const active = i === activeFrameIdx
            return (
              <div
                key={f.localId}
                className={`flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 ${
                  active ? 'border-sky-400/60 bg-white/10' : 'border-white/10 hover:bg-white/5'
                }`}
              >
                <button
                  onClick={() => switchFrame(i)}
                  title={label}
                  className={`text-[11px] ${active ? 'text-white' : 'text-neutral-300 hover:text-white'}`}
                >
                  <span className="mr-1 font-semibold text-neutral-500">{i + 1}</span>
                  {label.replace(/ frame$/, '')}
                </button>
                <button
                  onClick={() => moveFrame(i, -1)}
                  disabled={i === 0}
                  title="Move left"
                  className="rounded px-0.5 text-[10px] text-neutral-500 hover:bg-white/10 hover:text-white disabled:opacity-30"
                >
                  ◂
                </button>
                <button
                  onClick={() => moveFrame(i, 1)}
                  disabled={i === carousel.frames.length - 1}
                  title="Move right"
                  className="rounded px-0.5 text-[10px] text-neutral-500 hover:bg-white/10 hover:text-white disabled:opacity-30"
                >
                  ▸
                </button>
                <button
                  onClick={() => deleteFrame(i)}
                  disabled={carousel.frames.length <= 1}
                  title="Delete frame"
                  className="rounded px-0.5 text-[10px] text-neutral-500 hover:bg-white/10 hover:text-white disabled:opacity-30"
                >
                  ×
                </button>
              </div>
            )
          })}
          <button
            onClick={duplicateFrame}
            title="Duplicate the active frame"
            className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] text-neutral-300 hover:bg-white/5 hover:text-white"
          >
            ⧉ Duplicate
          </button>
          <div className="relative shrink-0">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) addFrame(e.target.value as UmamiTemplateKind)
              }}
              title="Add a frame"
              className="rounded-md border border-white/10 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300"
            >
              <option value="">+ Add frame…</option>
              {UMAMI_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── 3-pane row ─────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">

      {/* ── Left: icon rail + active-category panel ──────────────────────────── */}
      <div className="flex w-full shrink-0 gap-2 lg:h-full lg:min-h-0 lg:w-80">
        {/* icon rail */}
        <div className="flex shrink-0 flex-col gap-1.5">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              title={label}
              onClick={() => selectTab(id)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                activeTab === id
                  ? 'border-sky-400/60 bg-white/10 text-white'
                  : 'border-transparent text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
              }`}
            >
              <Icon size={18} weight={activeTab === id ? 'fill' : 'regular'} />
            </button>
          ))}
        </div>

        {/* active-category panel */}
        <div className="min-w-0 flex-1 space-y-4 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          {error && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">{error}</p>
          )}
          {loading && <p className="text-[11px] text-neutral-500">Loading…</p>}

          {activeTab === 'setup' && (
            <>
              {/* Umami frames are story-less — no story/section pickers. */}
              {!isUmami && (
                <>
                  <label className={labelCls}>
                    Story {slug === '' ? '· composing from scratch' : '· attached'}
                    <select value={slug} onChange={(e) => pickStory(e.target.value)} className={selectCls}>
                      <option value="">Blank canvas (no story)</option>
                      {stories.map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.title || s.slug}
                        </option>
                      ))}
                    </select>
                  </label>
                  {slug === '' && (
                    <p className="text-[10px] text-neutral-600">
                      Build with backgrounds, text, images, icons &amp; flags. Attach a story above to pull in
                      its theme, map &amp; chart.
                    </p>
                  )}
                  {units.length > 0 && (
                    <label className={labelCls}>
                      Section
                      <select value={unitIdx} onChange={(e) => pickUnit(Number(e.target.value))} className={selectCls}>
                        {units.map((u, i) => (
                          <option key={`${u.parentIndex}-${u.subIndex}`} value={i}>
                            {u.heading?.slice(0, 50) || `Section ${u.parentIndex + 1}`}
                            {u.subIndex > 0 ? ` · step ${u.subIndex}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  Template
                  <select value={templateKind} onChange={(e) => pickTemplate(e.target.value as TemplateKind)} className={selectCls}>
                    {(isUmami ? UMAMI_TEMPLATES : TEMPLATES).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  Format
                  <select value={ratio} onChange={(e) => setRatio(e.target.value as AspectRatio)} className={selectCls}>
                    {(isUmami ? ASPECT_RATIOS.filter((r) => r.id === '1:1' || r.id === '4:5') : ASPECT_RATIOS).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {isUmami && (
                <div>
                  <span className={labelCls}>Palette</span>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {(['paper', 'spice'] as const).map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setUmamiTheme(name)}
                        className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                          activeUmamiTheme === name
                            ? 'border-sky-400/60 bg-white/10 text-neutral-100'
                            : 'border-white/10 text-neutral-300 hover:bg-white/5'
                        }`}
                      >
                        <span className="flex shrink-0 overflow-hidden rounded-sm border border-white/15">
                          {[UMAMI_THEMES[name].colors.background, UMAMI_THEMES[name].colors.accent, UMAMI_THEMES[name].colors.text].map((c, i) => (
                            <span key={i} style={{ background: c }} className="h-4 w-2.5" />
                          ))}
                        </span>
                        <span className="capitalize">{name === 'paper' ? 'Paper (light)' : 'Spice (dark)'}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-neutral-600">
                    Flips every palette color on the frame; hand-picked colors stay put.
                  </p>
                </div>
              )}
              {isUmami && templateKind === 'umami-compare' && (
                <div className="space-y-1.5">
                  <span className={labelCls}>Ground in dishes</span>
                  <DishPicker label="Dish A" picked={dishPicks.a?.name ?? null} onPick={(d) => pickDish('a', d)} />
                  <DishPicker label="Dish B" picked={dishPicks.b?.name ?? null} onPick={(d) => pickDish('b', d)} />
                </div>
              )}
              {isUmami && templateKind === 'umami-dish' && (
                <div className="space-y-1.5">
                  <span className={labelCls}>Ground in a dish</span>
                  <DishPicker label="Dish" picked={dishPicks.spotlight?.name ?? null} onPick={(d) => pickDish('spotlight', d)} />
                </div>
              )}
              {composition && (
                <label className="flex items-center gap-2 text-[12px] text-neutral-200">
                  <input
                    type="checkbox"
                    checked={composition.branding.visible}
                    onChange={(e) => setComposition({ ...composition, branding: { ...composition.branding, visible: e.target.checked } })}
                    className="accent-sky-400"
                  />
                  Show branding footer
                </label>
              )}
            </>
          )}

          {composition && activeTab === 'theme' && (
            <ThemePanel
              theme={effectiveTheme}
              isOverride={!!composition.theme}
              storyAttached={slug !== ''}
              onChange={(next) => setComposition({ ...composition, theme: next })}
              // Drop the override so the card falls back to the story / default
              // theme (undefined is omitted by JSON.stringify when saved).
              onReset={() => setComposition({ ...composition, theme: undefined })}
              extraPresets={
                isUmami
                  ? [
                      { id: 'umami-paper', label: 'Paper (light)', theme: UMAMI_PAPER },
                      { id: 'umami-spice', label: 'Spice (dark)', theme: UMAMI_SPICE },
                    ]
                  : undefined
              }
            />
          )}

          {composition && inspectorStory && activeTab === 'background' && (
            <Inspector composition={composition} selection={{ kind: 'background' }} onChange={setComposition} story={inspectorStory} ratio={ratio} onEditMap={onEditMap} />
          )}

          {composition && inspectorStory && activeTab === 'elements' && (
            <LayerPanel
              composition={composition}
              onChange={setComposition}
              selection={selection}
              setSelection={setSelection}
              story={{ slug: story!.slug, theme: story!.theme, assets }}
              sections={['elements']}
              inspectorStory={inspectorStory}
              ratio={ratio}
              onEditMap={onEditMap}
              defaultChartId={defaultChartId}
              fillHeight
              multiSel={multiSel}
              setMultiSel={setMultiSel}
            />
          )}

          {composition && activeTab === 'text' && (
            <>
              <LayerPanel
                composition={composition}
                onChange={setComposition}
                selection={selection}
                setSelection={setSelection}
                story={{ slug: story!.slug, theme: story!.theme, assets }}
                sections={['text']}
              />
              {(selection?.kind === 'text' || selection?.kind === 'annotation') && inspectorStory && (
                <div className="border-t border-white/10 pt-3">
                  <Inspector composition={composition} selection={selection} onChange={setComposition} story={inspectorStory} ratio={ratio} onEditMap={onEditMap} />
                </div>
              )}
            </>
          )}

          {!composition && !loading && <p className="text-[11px] text-neutral-600">Pick a story to start.</p>}
        </div>
      </div>

      {/* ── Center: preview + drag overlay ─────────────────────────────────── */}
      <div
        ref={previewBoxRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-neutral-950/40 p-4 lg:h-full"
      >
        {story && selectedUnit && composition ? (
          <div className="relative" style={{ width: renderW * previewScale, height: renderH * previewScale }}>
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', width: renderW, height: renderH }}>
              <ThemeProvider theme={effectiveTheme}>
                <VerticalLoader vertical={story.vertical ?? undefined}>
                  <ShareCard
                    ref={cardRef}
                    composition={composition}
                    unit={selectedUnit}
                    ratio={ratio}
                    slug={story.slug}
                    title={story.title}
                    vertical={story.vertical ?? undefined}
                    accessToken={accessToken}
                    palette={story.defaults.mapPalette}
                    fontstack={story.defaults.mapFontstack}
                    highlightCountry={story.defaults.highlightCountry}
                    highlightColor={story.defaults.highlightColor}
                    mapStyle={story.defaults.mapStyle}
                    mapOpacity={story.defaults.mapOpacity}
                    defaultPinColor={story.defaults.pinColor}
                    defaultPinRadius={story.defaults.pinRadius}
                    disableDownload
                  />
                </VerticalLoader>
              </ThemeProvider>
            </div>

            {/* Drag layer over the card (not part of the captured node). */}
            <div ref={interactionRef} className="absolute inset-0" onPointerDown={() => setSelection(null)}>
              {draggables.map((d) => {
                const active =
                  !!selection && JSON.stringify(selection) === JSON.stringify(d.sel)
                const inGroupSel = selection?.kind === 'group' && !!d.groupId && d.groupId === selection.id
                const ticked = !!d.elId && multiSel.includes(d.elId)
                const ring = active
                  ? 'ring-2 ring-sky-400/90'
                  : ticked
                    ? 'ring-2 ring-sky-400/60'
                    : inGroupSel
                      ? 'ring-1 ring-sky-400/50'
                      : 'ring-1 ring-transparent hover:ring-white/30'
                return (
                  <div
                    key={d.key}
                    onPointerDown={(e) =>
                      d.elId ? onElementPointerDown(e, d.elId, d.groupId) : onLayerPointerDown(e, d.sel)
                    }
                    className="absolute cursor-move"
                    style={{
                      // % is relative to the interaction box (already the card's
                      // on-screen size), so it's scale-independent. Pixel height
                      // is in card-render coords, so it scales by previewScale.
                      left: `${d.t.xPct}%`,
                      top: `${d.t.yPct}%`,
                      width: `${d.t.widthPct}%`,
                      height: d.heightPx ? d.heightPx * previewScale : undefined,
                      aspectRatio: d.heightPx ? undefined : '1 / 1',
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <div className={`h-full w-full rounded ${ring}`} />
                  </div>
                )
              })}

              {/* Group transform box — drag body to move, corners to resize,
                  top handle to rotate. Sits above the member hit-boxes. */}
              {groupBox && selection?.kind === 'group' && (
                <div
                  className="absolute"
                  style={{
                    left: `${groupBox.left}%`,
                    top: `${groupBox.top}%`,
                    width: `${groupBox.w}%`,
                    height: `${(groupBox.h / 100) * renderH * previewScale}px`,
                  }}
                >
                  {/* draggable body */}
                  <div
                    onPointerDown={(e) => startGroupMove(selection.id, e)}
                    className="absolute inset-0 cursor-move rounded border border-dashed border-sky-400/80 bg-sky-400/5"
                  />
                  {/* corner resize handles (0 TL,1 TR,2 BR,3 BL) */}
                  {[
                    { c: 0, pos: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize' },
                    { c: 1, pos: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize' },
                    { c: 2, pos: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize' },
                    { c: 3, pos: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize' },
                  ].map(({ c, pos }) => (
                    <div
                      key={c}
                      onPointerDown={(e) => startGroupScale(selection.id, c, e)}
                      className={`absolute h-2.5 w-2.5 rounded-sm border border-sky-400 bg-neutral-900 ${pos}`}
                    />
                  ))}
                  {/* rotate handle above the top edge */}
                  <div
                    onPointerDown={(e) => startGroupRotate(selection.id, e)}
                    className="absolute left-1/2 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full border border-sky-400 bg-neutral-900"
                    style={{ top: -22 }}
                    title="Rotate group"
                  />
                  <div className="absolute left-1/2 h-[14px] w-px -translate-x-1/2 bg-sky-400/70" style={{ top: -14 }} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="py-20 text-center text-xs text-neutral-600">{loading ? 'Loading story…' : 'Pick a story and section to start.'}</p>
        )}
      </div>
      </div>

      {/* ── Map edit overlay ───────────────────────────────────────────────── */}
      {mapEditOpen && story && (
        <MapPickerModal
          sectionLabel={`${selectedUnit?.heading?.slice(0, 50) || story.title} · ${ratio}`}
          style={mapEditStyle}
          initialView={mapEditSeed ?? undefined}
          focusArea={mapEditIsBackground ? SHARE_FOCUS_AREA[ratio] : CONTAINED_FOCUS}
          frame={
            mapEditSel?.kind === 'element'
              ? { width: 1080, height: 1080, label: `Map element · ${ratio}` }
              : { width: OUTPUT_SIZE[ratio].w, height: OUTPUT_SIZE[ratio].h, label: `Share card · ${ratio}` }
          }
          onApplyView={applyMapView}
          onClose={() => setMapEditOpen(false)}
        />
      )}
    </div>
    </ExtraStyleTemplatesContext.Provider>
  )
}
