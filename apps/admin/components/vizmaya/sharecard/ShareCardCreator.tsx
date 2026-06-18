'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { ResolvedUnit, Theme, MapPalette, MapView } from '@vismay/viz-engine'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import ThemeProvider from '@/components/canvas/ThemeProvider'
import VerticalLoader from '@/components/canvas/VerticalLoader'
import MapPickerModal from '@/components/vizmaya/MapPickerModal'
import ShareCard, { RENDER_SIZE, OUTPUT_SIZE, type ShareCardHandle } from './ShareCard'
import { ASPECT_RATIOS, SHARE_FOCUS_AREA } from './constants'
import { seedTemplate, detectSupport } from './layers/seedTemplate'
import type { CardComposition, HeroLayer, MapSpec, TemplateKind, Transform } from './layers/types'
import { DEFAULT_HERO_BOX } from './layers/types'
import {
  applyV1Overrides,
  composeBaseType,
  snapshotVersion,
  templateKindFromV1,
} from './layers/migrate'
import { LayerPanel } from './composer/LayerPanel'
import { Inspector } from './composer/Inspector'
import {
  getSelectedText,
  patchElementTransform,
  patchSelectedText,
  type Selection,
} from './composer/mutations'
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
  const [slug, setSlug] = useState<string>(stories[0]?.slug ?? '')
  const [story, setStory] = useState<StoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ratio, setRatio] = useState<AspectRatio>('4:5')
  const [unitIdx, setUnitIdx] = useState<number>(0)
  const [templateKind, setTemplateKind] = useState<TemplateKind>('map-caption')
  const [composition, setComposition] = useState<CardComposition | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)

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

  const cardRef = useRef<ShareCardHandle>(null)

  const units = useMemo(() => story?.units ?? [], [story])
  const selectedUnit = units[unitIdx] ?? null

  // Resolve a loaded snapshot (v1 migrated, v2 direct) against a story+unit.
  const applyLoadedSnapshot = useCallback(
    (storyData: StoryData, snap: AnyShareCardSnapshot, useRatio: AspectRatio) => {
      const idx = storyData.units.findIndex(
        (u) => u.parentIndex === snap.parentIndex && u.subIndex === snap.subIndex,
      )
      const resolvedIdx = idx >= 0 ? idx : 0
      setUnitIdx(resolvedIdx)
      const unit = storyData.units[resolvedIdx]
      if (!unit) return
      try {
        if (snapshotVersion(snap) === 2) {
          const v2 = snap as VizmayaShareCardSnapshotV2
          setComposition(v2.composition)
          setTemplateKind(v2.templateKind)
        } else {
          const v1 = snap as Extract<AnyShareCardSnapshot, { version: 1 }>
          const kind = templateKindFromV1(v1)
          setComposition(applyV1Overrides(seedTemplate(kind, unit, storyData, useRatio), v1))
          setTemplateKind(kind)
        }
        setSelection(null)
      } catch (e) {
        setError(e instanceof Error ? `Couldn't load card: ${e.message}` : "Couldn't load this card (older format).")
      }
    },
    [],
  )

  // ── load the selected story ───────────────────────────────────────────────
  useEffect(() => {
    if (!slug) {
      setStory(null)
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

  const fontImportUrl = useMemo(() => (story ? getFontImportUrl(story.theme.fonts) : null), [story])

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
        return prev ? { ...seed, elements: prev.elements, branding: prev.branding } : seed
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
        return prev ? { ...seed, elements: prev.elements, branding: prev.branding } : seed
      })
    },
    [selectedUnit, story, ratio],
  )

  const pickStory = useCallback((nextSlug: string) => {
    setCurrentCardId(null)
    pendingLoadRef.current = null
    pendingUnitRef.current = null
    setSlug(nextSlug)
  }, [])

  // ── map edit overlay ────────────────────────────────────────────────────
  const mapSpecForSelection = useCallback(
    (sel: Selection): MapSpec | null => {
      if (!composition) return null
      if (sel.kind === 'background' && composition.background.kind === 'map') return composition.background
      if (sel.kind === 'hero' && composition.hero?.kind === 'map') return composition.hero
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
        if (sel.kind === 'hero' && prev.hero?.kind === 'map') {
          return { ...prev, hero: { ...prev.hero, camera: { ...prev.hero.camera, [ratio]: view } } }
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
      if (sel.kind === 'hero' && prev.hero) {
        const cur = prev.hero.box ?? DEFAULT_HERO_BOX
        return { ...prev, hero: { ...prev.hero, box: { ...cur, xPct, yPct } } as HeroLayer }
      }
      return prev
    })
  }, [])

  const onLayerPointerDown = useCallback(
    (e: ReactPointerEvent, sel: Selection) => {
      e.preventDefault()
      e.stopPropagation()
      setSelection(sel)
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

  // Build the draggable hit targets from the composition.
  interface Draggable {
    key: string
    sel: Selection
    t: Transform
    heightPx?: number
  }
  const draggables = useMemo<Draggable[]>(() => {
    if (!composition) return []
    const out: Draggable[] = []
    const c = composition
    // Hero first so text/element hit-boxes stack above it (stay clickable).
    if (c.hero) {
      const b = c.hero.box ?? DEFAULT_HERO_BOX
      out.push({
        key: 'hero',
        sel: { kind: 'hero' },
        t: { xPct: b.xPct, yPct: b.yPct, widthPct: b.widthPct, scale: 1, rotation: 0, opacity: 1 },
        heightPx: (b.heightPct / 100) * renderH,
      })
    }
    if (c.text.heading?.visible)
      out.push({ key: 'heading', sel: { kind: 'text', which: 'heading' }, t: c.text.heading.transform, heightPx: c.text.heading.style.fontSizePx * c.text.heading.style.lineHeight * 1.8 })
    if (c.text.subheading?.visible)
      out.push({ key: 'subheading', sel: { kind: 'text', which: 'subheading' }, t: c.text.subheading.transform, heightPx: c.text.subheading.style.fontSizePx * c.text.subheading.style.lineHeight * 1.8 })
    for (const a of c.text.annotations)
      if (a.visible) out.push({ key: a.id, sel: { kind: 'annotation', id: a.id }, t: a.transform, heightPx: a.style.fontSizePx * a.style.lineHeight * 2.2 })
    for (const el of c.elements)
      if (el.visible) out.push({ key: el.id, sel: { kind: 'element', id: el.id }, t: el.transform })
    return out
  }, [composition, renderH])

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

      {/* ── Left: story/section pickers + layer panel ──────────────────────── */}
      <div className="w-full shrink-0 space-y-4 lg:h-full lg:w-72 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
        <label className={labelCls}>
          Story
          <select value={slug} onChange={(e) => pickStory(e.target.value)} className={selectCls}>
            {stories.length === 0 && <option value="">No stories</option>}
            {stories.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title || s.slug}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">{error}</p>
        )}
        {loading && <p className="text-[11px] text-neutral-500">Loading…</p>}

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

        <hr className="border-white/10" />

        {composition && (
          <LayerPanel
            composition={composition}
            onChange={setComposition}
            selection={selection}
            setSelection={setSelection}
            story={{ slug: story!.slug, theme: story!.theme, assets }}
          />
        )}
      </div>

      {/* ── Center: preview + drag overlay ─────────────────────────────────── */}
      <div
        ref={previewBoxRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-neutral-950/40 p-4 lg:h-full"
      >
        {story && selectedUnit && composition ? (
          <div className="relative" style={{ width: renderW * previewScale, height: renderH * previewScale }}>
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', width: renderW, height: renderH }}>
              <ThemeProvider theme={story.theme}>
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
                return (
                  <div
                    key={d.key}
                    onPointerDown={(e) => onLayerPointerDown(e, d.sel)}
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
                    <div className={`h-full w-full rounded ${active ? 'ring-2 ring-sky-400/90' : 'ring-1 ring-transparent hover:ring-white/30'}`} />
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="py-20 text-center text-xs text-neutral-600">{loading ? 'Loading story…' : 'Pick a story and section to start.'}</p>
        )}
      </div>

      {/* ── Right: inspector ───────────────────────────────────────────────── */}
      <div className="w-full shrink-0 space-y-3 lg:h-full lg:w-72 lg:min-h-0 lg:overflow-y-auto lg:pl-1">
        <span className={labelCls}>Inspector</span>
        {composition && inspectorStory ? (
          <Inspector
            composition={composition}
            selection={selection}
            onChange={setComposition}
            story={inspectorStory}
            ratio={ratio}
            onEditMap={onEditMap}
          />
        ) : (
          <p className="text-[11px] text-neutral-600">Load a story to begin.</p>
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
