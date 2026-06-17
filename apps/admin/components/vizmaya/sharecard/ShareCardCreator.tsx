'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { ResolvedUnit, Theme, MapPalette } from '@vismay/viz-engine'
import { resolveSlotsFlat } from '@vismay/viz-engine'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import ThemeProvider from '@/components/canvas/ThemeProvider'
import VerticalLoader from '@/components/canvas/VerticalLoader'
import ShareCard, { RENDER_SIZE, type ShareCardHandle } from './ShareCard'
import {
  ASPECT_RATIOS,
  CARD_VARIANTS,
  EMOJI_PALETTE,
  GRAPH_SCOPES,
} from './constants'
import type {
  AspectRatio,
  CardVariant,
  GraphScope,
  Overlay,
  SavedCard,
  VizmayaShareCardSnapshot,
} from './types'

/** Story-config map defaults the card map needs. Structural subset of
 *  StoryDefaults so we don't couple to its full type. */
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

const PREVIEW_MAX_W = 380
const PREVIEW_MAX_H = 560

const DEFAULT_IMAGE_WIDTH = 32 // % of card width
const DEFAULT_EMOJI_WIDTH = 14 // % of card width (drives glyph px)

interface AssetEntry {
  url: string
  filename: string
  contentType: string | null
}

export function ShareCardCreator({
  stories,
  accessToken,
}: {
  stories: StoryOption[]
  accessToken: string
}) {
  // ── story selection + load ──────────────────────────────────────────────
  const [slug, setSlug] = useState<string>(stories[0]?.slug ?? '')
  const [story, setStory] = useState<StoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── card controls ───────────────────────────────────────────────────────
  const [ratio, setRatio] = useState<AspectRatio>('4:5')
  const [variant, setVariant] = useState<CardVariant>('map-title')
  const [graphScope, setGraphScope] = useState<GraphScope>('all')
  const [unitIdx, setUnitIdx] = useState<number>(0)
  const [headingOverride, setHeadingOverride] = useState<string>('')
  const [subheadingOverride, setSubheadingOverride] = useState<string>('')

  // ── overlays ────────────────────────────────────────────────────────────
  const [overlays, setOverlays] = useState<Overlay[]>([])
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  const overlaySeq = useRef(0)

  // ── assets / AI / library ───────────────────────────────────────────────
  const [assets, setAssets] = useState<AssetEntry[]>([])
  const [aiSubject, setAiSubject] = useState<string>('')
  const [aiStyle, setAiStyle] = useState<string>('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [saving, setSaving] = useState(false)
  const [currentCardId, setCurrentCardId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  // Unit to restore once a story finishes loading (set when loading a saved card).
  const pendingUnitRef = useRef<{ parentIndex: number; subIndex: number } | null>(null)

  const cardRef = useRef<ShareCardHandle>(null)

  // ── load the selected story's content ───────────────────────────────────
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
        const body = (await res.json().catch(() => ({}))) as
          | (StoryData & { ok?: boolean })
          | { error?: string }
        if (!res.ok || !('ok' in body) || !body.ok) {
          throw new Error(('error' in body && body.error) || `HTTP ${res.status}`)
        }
        if (!alive) return
        setStory(body)
        // Restore the saved unit pick, or default to the first unit.
        const pending = pendingUnitRef.current
        const idx =
          pending != null
            ? body.units.findIndex(
                (u) => u.parentIndex === pending.parentIndex && u.subIndex === pending.subIndex,
              )
            : 0
        setUnitIdx(idx >= 0 ? idx : 0)
        pendingUnitRef.current = null
      } catch (e) {
        if (alive) {
          setStory(null)
          setError(e instanceof Error ? e.message : 'Failed to load story')
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [slug])

  // ── load the story's image assets (for the asset picker) ────────────────
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

  // ── load the saved-card library once ────────────────────────────────────
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

  const units = useMemo(() => story?.units ?? [], [story])
  const selectedUnit = units[unitIdx] ?? null

  // What the currently selected section actually supports — used to enable the
  // right card-style options and to auto-pick a sensible default.
  const support = useMemo(() => {
    if (!selectedUnit) return { hasMap: false, hasViz: false }
    const slots = resolveSlotsFlat(selectedUnit.parentConfig)
    const hasMap = slots.background.some(
      (l) => l.type === 'map' && Array.isArray((l as { center?: unknown }).center),
    )
    const hasViz = slots.foreground.some((l) => l.type !== 'text' && l.type !== 'bodyText')
    return { hasMap, hasViz }
  }, [selectedUnit])

  // Keep the chosen variant valid for the selected section.
  useEffect(() => {
    if (variant === 'map-title' && !support.hasMap) {
      setVariant(support.hasViz ? 'graph' : 'auto')
    } else if (variant === 'graph' && !support.hasViz) {
      setVariant(support.hasMap ? 'map-title' : 'auto')
    }
  }, [support, variant])

  const baseType = variant === 'map-title' ? 'map-caption' : 'data'

  // ── preview sizing ──────────────────────────────────────────────────────
  const { w: renderW, h: renderH } = RENDER_SIZE[ratio]
  const previewScale = Math.min(PREVIEW_MAX_W / renderW, PREVIEW_MAX_H / renderH, 1)

  const fontImportUrl = useMemo(
    () => (story ? getFontImportUrl(story.theme.fonts) : null),
    [story],
  )

  // Minimal share override carrying only the caption text edits; empty fields
  // fall through to the unit's own heading/subheading.
  const shareOverride = useMemo(() => {
    const h = headingOverride.trim()
    const s = subheadingOverride.trim()
    if (!h && !s) return undefined
    return { heading: h || undefined, subheading: s || undefined }
  }, [headingOverride, subheadingOverride])

  // ── overlay handlers ────────────────────────────────────────────────────
  const addImageOverlay = useCallback((url: string, label: string) => {
    const id = `ov-${overlaySeq.current++}`
    setOverlays((prev) => [
      ...prev,
      { id, kind: 'image', url, label, xPct: 50, yPct: 50, widthPct: DEFAULT_IMAGE_WIDTH },
    ])
    setSelectedOverlayId(id)
  }, [])

  const addEmojiOverlay = useCallback((emoji: string) => {
    const id = `ov-${overlaySeq.current++}`
    setOverlays((prev) => [
      ...prev,
      { id, kind: 'emoji', text: emoji, label: emoji, xPct: 50, yPct: 50, widthPct: DEFAULT_EMOJI_WIDTH },
    ])
    setSelectedOverlayId(id)
  }, [])

  const removeOverlay = useCallback((id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id))
    setSelectedOverlayId((cur) => (cur === id ? null : cur))
  }, [])

  const setOverlayWidth = useCallback((id: string, widthPct: number) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, widthPct } : o)))
  }, [])

  const onPickUpload = useCallback(
    (file: File | null) => {
      if (!file) return
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') addImageOverlay(reader.result, file.name)
      }
      reader.readAsDataURL(file)
    },
    [addImageOverlay],
  )

  const handleGenerate = useCallback(async () => {
    const subject = aiSubject.trim()
    if (!subject) {
      setAiError('Describe what to generate.')
      return
    }
    setAiBusy(true)
    setAiError(null)
    try {
      const paletteHexes = story
        ? [story.theme.colors.accent, story.theme.colors.accent2].filter(Boolean)
        : []
      const res = await fetch('/api/vizmaya/share-cards/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, ratio, paletteHexes, stylePrefix: aiStyle.trim() || undefined }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; dataUrl?: string; error?: string }
      if (!res.ok || !body.ok || !body.dataUrl) throw new Error(body.error ?? `HTTP ${res.status}`)
      addImageOverlay(body.dataUrl, subject.slice(0, 40))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setAiBusy(false)
    }
  }, [aiSubject, aiStyle, ratio, story, addImageOverlay])

  // ── drag overlays over the preview ──────────────────────────────────────
  // The move/end handlers are created per drag so `end` can unregister itself
  // and `move` without a self-referencing top-level callback.
  const interactionRef = useRef<HTMLDivElement>(null)
  const dragIdRef = useRef<string | null>(null)
  const onOverlayPointerDown = useCallback(
    (e: ReactPointerEvent, id: string) => {
      e.preventDefault()
      setSelectedOverlayId(id)
      dragIdRef.current = id
      const move = (ev: PointerEvent) => {
        const el = interactionRef.current
        if (!dragIdRef.current || !el) return
        const rect = el.getBoundingClientRect()
        const xPct = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100))
        const yPct = Math.min(100, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100))
        setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, xPct, yPct } : o)))
      }
      const end = () => {
        dragIdRef.current = null
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
    },
    [],
  )

  // ── capture / download ──────────────────────────────────────────────────
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

  // ── save / load / delete ────────────────────────────────────────────────
  const buildSnapshot = useCallback((): VizmayaShareCardSnapshot => ({
    version: 1,
    storySlug: slug || null,
    ratio,
    variant,
    graphScope,
    parentIndex: selectedUnit?.parentIndex ?? 0,
    subIndex: selectedUnit?.subIndex ?? 0,
    headingOverride,
    subheadingOverride,
    overlays,
  }), [slug, ratio, variant, graphScope, selectedUnit, headingOverride, subheadingOverride, overlays])

  const handleSave = useCallback(async () => {
    if (!story || !selectedUnit) return
    const fallback = `${story.title} · ${CARD_VARIANTS.find((v) => v.id === variant)?.label ?? variant}`
    const name = window.prompt('Name this card', fallback)?.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await fetch('/api/vizmaya/share-cards/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, storySlug: slug, baseType, ratio, config: buildSnapshot() }),
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
  }, [story, selectedUnit, variant, slug, baseType, ratio, buildSnapshot])

  const loadCard = useCallback((card: SavedCard) => {
    const snap = card.config
    setRatio(snap.ratio)
    setVariant(snap.variant)
    setGraphScope(snap.graphScope)
    setHeadingOverride(snap.headingOverride ?? '')
    setSubheadingOverride(snap.subheadingOverride ?? '')
    setOverlays((snap.overlays ?? []).map((o) => ({ ...o, id: `ov-${overlaySeq.current++}` })))
    setSelectedOverlayId(null)
    setCurrentCardId(card.id)
    pendingUnitRef.current = { parentIndex: snap.parentIndex, subIndex: snap.subIndex }
    if (snap.storySlug && snap.storySlug !== slug) {
      setSlug(snap.storySlug)
    } else if (story) {
      // Same story already loaded — resolve the unit now.
      const idx = units.findIndex(
        (u) => u.parentIndex === snap.parentIndex && u.subIndex === snap.subIndex,
      )
      if (idx >= 0) setUnitIdx(idx)
      pendingUnitRef.current = null
    }
  }, [slug, story, units])

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
  const inputCls =
    'mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30'

  const availableVariants = CARD_VARIANTS.filter((v) =>
    v.id === 'map-title' ? support.hasMap : v.id === 'graph' ? support.hasViz : true,
  )

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {fontImportUrl && <link href={fontImportUrl} rel="stylesheet" />}

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="w-full shrink-0 space-y-4 lg:w-80">
        {/* Story */}
        <label className={labelCls}>
          Story
          <select value={slug} onChange={(e) => setSlug(e.target.value)} className={selectCls}>
            {stories.length === 0 && <option value="">No stories</option>}
            {stories.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title || s.slug}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
            {error}
          </p>
        )}
        {loading && <p className="text-[11px] text-neutral-500">Loading…</p>}

        {/* Section */}
        {units.length > 0 && (
          <label className={labelCls}>
            Section
            <select
              value={unitIdx}
              onChange={(e) => setUnitIdx(Number(e.target.value))}
              className={selectCls}
            >
              {units.map((u, i) => (
                <option key={`${u.parentIndex}-${u.subIndex}`} value={i}>
                  {u.heading?.slice(0, 60) || `Section ${u.parentIndex + 1}`}
                  {u.subIndex > 0 ? ` · step ${u.subIndex}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Card style + ratio */}
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Card style
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value as CardVariant)}
              className={selectCls}
            >
              {availableVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
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

        {/* Data scope */}
        {variant === 'graph' && (
          <label className={labelCls}>
            Data shown
            <select
              value={graphScope}
              onChange={(e) => setGraphScope(e.target.value as GraphScope)}
              className={selectCls}
            >
              {GRAPH_SCOPES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Caption overrides */}
        <div>
          <span className={labelCls}>Caption (optional)</span>
          <input
            value={headingOverride}
            onChange={(e) => setHeadingOverride(e.target.value)}
            placeholder="Heading — blank uses the section heading"
            className={inputCls}
          />
          <input
            value={subheadingOverride}
            onChange={(e) => setSubheadingOverride(e.target.value)}
            placeholder="Subheading"
            className={inputCls}
          />
        </div>

        <hr className="border-white/10" />

        {/* Emojis */}
        <div>
          <span className={labelCls}>Emojis</span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {EMOJI_PALETTE.map((e) => (
              <button
                key={e}
                onClick={() => addEmojiOverlay(e)}
                className="rounded-md border border-white/10 bg-neutral-900 px-1.5 py-1 text-base hover:border-white/30"
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Upload + Generate */}
        <div>
          <span className={labelCls}>Add image</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onPickUpload(e.target.files?.[0] ?? null)}
            className="mt-1.5 block w-full text-[11px] text-neutral-400 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:text-neutral-100 hover:file:bg-white/20"
          />
          <div className="mt-2 space-y-1.5 rounded-lg border border-white/10 bg-neutral-950/60 p-2.5">
            <textarea
              value={aiSubject}
              onChange={(e) => setAiSubject(e.target.value)}
              rows={2}
              placeholder="Generate an image — describe it…"
              className="w-full resize-vertical rounded border border-white/10 bg-neutral-950 p-2 text-[12px] text-neutral-100 outline-none focus:border-white/30"
            />
            <input
              value={aiStyle}
              onChange={(e) => setAiStyle(e.target.value)}
              placeholder="Style (optional) — e.g. editorial photo"
              className="w-full rounded border border-white/10 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-100 outline-none focus:border-white/30"
            />
            <button
              onClick={() => void handleGenerate()}
              disabled={aiBusy || !aiSubject.trim()}
              className="w-full rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 disabled:opacity-40"
            >
              {aiBusy ? 'Generating…' : 'Generate & place'}
            </button>
            {aiError && <p className="text-[11px] text-red-400">{aiError}</p>}
          </div>
        </div>

        {/* Story assets */}
        {assets.length > 0 && (
          <div>
            <span className={labelCls}>Story assets</span>
            <div className="mt-1.5 grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto">
              {assets.map((a) => (
                <button
                  key={a.url}
                  onClick={() => addImageOverlay(a.url, a.filename)}
                  title={a.filename}
                  className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-white/10 bg-neutral-900 hover:border-white/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="max-h-full max-w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Placed overlays */}
        {overlays.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] text-neutral-500">Placed · drag on the card to move</span>
            {overlays.map((o) => (
              <div
                key={o.id}
                onClick={() => setSelectedOverlayId(o.id)}
                className={`flex items-center gap-2 rounded-md border p-1.5 ${
                  selectedOverlayId === o.id ? 'border-sky-400/70 bg-white/5' : 'border-white/10'
                }`}
              >
                {o.kind === 'emoji' ? (
                  <span className="w-6 text-center text-base">{o.text}</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.url} alt="" className="h-6 w-6 shrink-0 object-contain" />
                )}
                <span className="flex-1 truncate text-[11px] text-neutral-300">{o.label}</span>
                <input
                  type="range"
                  min={4}
                  max={90}
                  value={o.widthPct}
                  onChange={(e) => setOverlayWidth(o.id, Number(e.target.value))}
                  className="w-20"
                  title="Size"
                />
                <button
                  onClick={() => removeOverlay(o.id)}
                  className="rounded px-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <hr className="border-white/10" />

        <div className="flex gap-2">
          <button
            onClick={() => void handleDownload()}
            disabled={!selectedUnit || downloading}
            className="flex-1 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {downloading ? 'Rendering…' : 'Download PNG'}
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!selectedUnit || saving}
            className="rounded-md border border-white/15 px-3 py-2 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Saved cards */}
        {savedCards.length > 0 && (
          <div>
            <span className={labelCls}>Saved cards</span>
            <div className="mt-1.5 space-y-1.5">
              {savedCards.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 rounded-md border p-1.5 ${
                    currentCardId === c.id ? 'border-sky-400/50 bg-white/5' : 'border-white/10'
                  }`}
                >
                  <button
                    onClick={() => loadCard(c)}
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
          </div>
        )}
      </div>

      {/* ── Preview ──────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 items-start justify-center rounded-xl border border-white/10 bg-neutral-950/40 p-6">
        {story && selectedUnit ? (
          <div className="relative" style={{ width: renderW * previewScale, height: renderH * previewScale }}>
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', width: renderW, height: renderH }}>
              <ThemeProvider theme={story.theme}>
                <VerticalLoader vertical={story.vertical ?? undefined}>
                  <ShareCard
                    ref={cardRef}
                    unit={selectedUnit}
                    index={unitIdx}
                    ratio={ratio}
                    slug={story.slug}
                    title={story.title}
                    vertical={story.vertical ?? undefined}
                    accessToken={accessToken}
                    variant={variant}
                    graphScope={graphScope}
                    shareOverride={shareOverride}
                    palette={story.defaults.mapPalette}
                    fontstack={story.defaults.mapFontstack}
                    highlightCountry={story.defaults.highlightCountry}
                    highlightColor={story.defaults.highlightColor}
                    mapOpacity={story.defaults.mapOpacity}
                    mapStyle={story.defaults.mapStyle}
                    defaultPinColor={story.defaults.pinColor}
                    defaultPinRadius={story.defaults.pinRadius}
                    overlays={overlays}
                    disableDownload
                  />
                </VerticalLoader>
              </ThemeProvider>
            </div>

            {/* Drag layer over the card (not part of the captured node). */}
            <div ref={interactionRef} className="absolute inset-0">
              {overlays.map((o) => (
                <div
                  key={o.id}
                  onPointerDown={(e) => onOverlayPointerDown(e, o.id)}
                  className="absolute cursor-move"
                  style={{
                    left: `${o.xPct}%`,
                    top: `${o.yPct}%`,
                    width: o.kind === 'image' ? `${o.widthPct}%` : 28,
                    aspectRatio: '1 / 1',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div
                    className={
                      'h-full w-full rounded ' +
                      (selectedOverlayId === o.id
                        ? 'ring-2 ring-sky-400/90'
                        : 'ring-1 ring-transparent hover:ring-white/30')
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="py-20 text-center text-xs text-neutral-600">
            {loading ? 'Loading story…' : 'Pick a story and section to preview a card.'}
          </p>
        )}
      </div>
    </div>
  )
}
