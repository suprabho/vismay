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
import ShareCard, { RENDER_SIZE, OUTPUT_SIZE, type ShareCardHandle } from './ShareCard'
import { ASPECT_RATIOS, SHARE_FOCUS_AREA } from './constants'
import { seedTemplate, detectSupport, SEED_GRAPHIC_ID } from './layers/seedTemplate'
import type { CardComposition, MapSpec, TemplateKind, Transform } from './layers/types'
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
}: {
  stories: StoryOption[]
  accessToken: string
}) {
  // Default to a blank canvas (slug ''); the user can attach a story after.
  const [slug, setSlug] = useState<string>('')
  const [story, setStory] = useState<StoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ratio, setRatio] = useState<AspectRatio>('4:5')
  const [unitIdx, setUnitIdx] = useState<number>(0)
  const [templateKind, setTemplateKind] = useState<TemplateKind>('map-caption')
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
      const blank: StoryData = { slug: '', title: 'Untitled', vertical: null, theme: DEFAULT_THEME, defaults: {}, units: [] }
      setStory(blank)
      setUnitIdx(0)
      setError(null)
      setLoading(false)
      const load = pendingLoadRef.current
      if (load) {
        // A saved card composed from scratch (no story) reopening.
        applyLoadedSnapshot(blank, load.snapshot, ratio)
      } else if (!attachKeepRef.current) {
        setComposition(blankComposition())
        setTemplateKind('title-text')
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

  // ── saved-card library ────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/vizmaya/share-cards/cards')
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; cards?: SavedCard[] }
        if (alive && body.ok) setSavedCards(body.cards ?? [])
      } catch {
        /* non-fatal */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // The theme the card actually renders with: a per-card override (set in the
  // Theme panel) wins, else the attached story's theme, else the default
  // editorial theme for a blank canvas.
  const effectiveTheme = composition?.theme ?? story?.theme ?? DEFAULT_THEME

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

  const pickTemplate = useCallback(
    (kind: TemplateKind) => {
      setTemplateKind(kind)
      setSelection(null)
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
    [selectedUnit, story, ratio],
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
      link.download = `${slug || 'vizmaya'}-${ratio.replace(':', 'x')}.png`
      link.href = dataUrl
      link.click()
    } finally {
      setDownloading(false)
    }
  }, [slug, ratio])

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

  const handleSave = useCallback(async () => {
    if (!story || !selectedUnit || !composition) return
    const snapshot = buildSnapshot()
    if (!snapshot) return
    const fallback = `${story.title} · ${TEMPLATES.find((t) => t.id === templateKind)?.label ?? templateKind}`
    const name = window.prompt('Name this card', fallback)?.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await fetch('/api/vizmaya/share-cards/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, storySlug: slug, baseType: composeBaseType(composition), ratio, config: snapshot }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; card?: SavedCard; error?: string }
      if (!res.ok || !body.ok || !body.card) throw new Error(body.error ?? `HTTP ${res.status}`)
      setSavedCards((prev) => [body.card!, ...prev])
      setCurrentCardId(body.card.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [story, selectedUnit, composition, buildSnapshot, templateKind, slug, ratio])

  const loadCard = useCallback(
    (card: SavedCard) => {
      const snap = card.config
      setCurrentCardId(card.id)
      setError(null)
      setRatio(snap.ratio as AspectRatio)
      if (story && story.slug === snap.storySlug) {
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
    <div className="flex h-full min-h-0 flex-col gap-3">
      {fontImportUrl && <link href={fontImportUrl} rel="stylesheet" />}

      {/* ── Top bar: title · saved cards · actions ─────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3">
        <h1 className="text-lg font-semibold text-neutral-100">Share cards</h1>

        <div ref={savedRef} className="relative">
          <button
            onClick={() => setSavedOpen((o) => !o)}
            disabled={savedCards.length === 0}
            className="flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            Saved cards{savedCards.length > 0 ? ` · ${savedCards.length}` : ''}
            <span className="text-neutral-500">▾</span>
          </button>
          {savedOpen && savedCards.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-white/10 bg-neutral-900 p-1.5 shadow-xl">
              {savedCards.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 rounded-md border p-1.5 ${currentCardId === c.id ? 'border-sky-400/50 bg-white/5' : 'border-transparent hover:bg-white/5'}`}
                >
                  <button
                    onClick={() => {
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

        <div className="flex-1" />

        <button
          onClick={() => void handleDownload()}
          disabled={!composition || downloading}
          className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {downloading ? 'Rendering…' : 'Download PNG'}
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={!composition || saving}
          className="rounded-md border border-white/15 px-3 py-1.5 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

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
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  Template
                  <select value={templateKind} onChange={(e) => pickTemplate(e.target.value as TemplateKind)} className={selectCls}>
                    {TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  Format
                  <select value={ratio} onChange={(e) => setRatio(e.target.value as AspectRatio)} className={selectCls}>
                    {ASPECT_RATIOS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
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
  )
}
