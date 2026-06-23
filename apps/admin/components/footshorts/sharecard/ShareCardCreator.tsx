'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { EventTypeFilter } from '@vismay/footshorts-viz/types'
import { listModulesForSlot, type VizLayer } from '@vismay/viz-engine'
import { CopySimple, FolderOpen, FrameCorners, Image as ImageIcon, PaperPlaneTilt, Plus, Sparkle, Stack, Trash, X, type Icon as PhosphorIcon } from '@phosphor-icons/react'
import {
  LayerListPanel,
  ConfigPanel,
  PreviewPane,
  addLayer,
  setLayerConfig,
  patchLayerTransform,
  patchLayerBox,
  normalizeGroupContiguity,
  composerUid,
  type ComposerLayer,
  type ComposerSelection,
  type ComposerState,
  type LayerBox,
  type LayerGroup,
  type TransformLike,
} from '@vismay/viz-admin'
import { type ThemeName } from '@footshorts/brand'
import { useCapture } from './useCapture'
import {
  ASPECT_RATIOS,
  LOGO_SIZES,
  LOGO_VARIANTS,
  OUTPUT_SIZE,
  RENDER_SCALE,
  resolveTheme,
  type AspectRatio,
  type CardBackground,
  type CardType,
  type CardFrameConfig,
  type CardThemeOverride,
  type LogoSize,
  type LogoVariant,
  type MatchRowVariant,
  type MatchStyle,
} from './types'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { registerFootshortsShareCardModules } from './modules'
import { proxiedImage } from './modules/shared'
import { footshortsHost } from './composer/host'
import { registerFootshortsPickers } from './composer/pickers'
import { ImagePicker } from './composer/ImagePicker'
import { ThemePanel } from './composer/ThemePanel'
import { useFootshortsCardData } from './composer/useFootshortsCardData'
import { compKeyOf, type CompetitionOption, type FootshortsComposerCtx } from './composer/ctx'

// Register the fscard:* modules + their picker editors into the registries on
// first import (idempotent), so the composer can resolve types + edit fields.
registerFootshortsShareCardModules()
registerFootshortsPickers()

// ── snapshot shapes ──────────────────────────────────────────────────────────
interface EntityResult {
  id: string
  type: 'team' | 'league'
  slug: string
  name: string
  crest_url: string | null
}

interface SavedCard {
  id: string
  name: string
  config: AnySnapshot
  entities?: Array<{ id: string; type: string; slug: string; name: string; crestUrl: string | null }>
}

/** The legacy single-`cardType` snapshot — only the fields the v1→v2 migration reads. */
interface ShareCardSnapshotV1 {
  version?: 1
  cardType: CardType
  themeName: ThemeName
  ratio: AspectRatio
  accentHex: string
  handle: string
  logoSize: LogoSize
  logoVariant: LogoVariant
  eyebrowOverride: string
  showEyebrow: boolean
  compKey: string
  pickedFixtureId: string
  pickedFixtureIds?: string[]
  pickedGroup?: string
  matchStyle: MatchStyle
  matchRowVariant?: MatchRowVariant
  pickedEventFilter?: EventTypeFilter
  pickedTeamSlug: string
  pickedNewsId: string
  aiCaption: string
  aiDataUrl: string
  background?: CardBackground
  backgroundScrim?: number
  overlays?: Array<{
    url: string
    label?: string
    kind: 'crest' | 'logo' | 'flag'
    xPct: number
    yPct: number
    widthPct: number
  }>
}

/** The multi-layer snapshot. */
interface ShareCardSnapshotV2 {
  version: 2
  themeName: ThemeName
  themeOverride?: CardThemeOverride
  ratio: AspectRatio
  accentHex: string
  handle: string
  logoSize: LogoSize
  logoVariant: LogoVariant
  eyebrowOverride: string
  showEyebrow: boolean
  background?: CardBackground
  backgroundScrim?: number
  foreground: ComposerLayer[]
  groups?: LayerGroup[]
}

type AnySnapshot = ShareCardSnapshotV1 | ShareCardSnapshotV2

function layerOf(layer: VizLayer, name: string): ComposerLayer {
  return { id: composerUid('layer'), layer, name, visible: true }
}

/** A reasonable free-mode transform for a migrated layer (it used to fill the
 *  card body): image cards bleed full-card; data cards get a large centered box. */
function migratedTransform(type: string, _ratio: AspectRatio): TransformLike {
  if (type === 'fscard:news-image' || type === 'fscard:ai-image') {
    return { xPct: 50, yPct: 50, widthPct: 100, heightPct: 100, scale: 1, rotation: 0, opacity: 1 }
  }
  return { xPct: 50, yPct: 50, widthPct: 92, heightPct: 72, scale: 1, rotation: 0, opacity: 1 }
}

/** Map the legacy single card type + picks (and any badges) onto layers. */
function v1ToForeground(s: ShareCardSnapshotV1): ComposerLayer[] {
  const compKey = s.compKey
  let main: ComposerLayer[]
  switch (s.cardType) {
    case 'match':
      main = [layerOf({ type: 'fscard:match', compKey, fixtureId: s.pickedFixtureId, matchStyle: s.matchStyle }, 'Match')]
      break
    case 'match-timeline':
      main = [layerOf({ type: 'fscard:match-timeline', compKey, fixtureId: s.pickedFixtureId, eventFilter: s.pickedEventFilter ?? 'all' }, 'Match timeline')]
      break
    case 'fixtures':
      main = [layerOf({ type: 'fscard:fixtures', compKey, fixtureIds: s.pickedFixtureIds ?? [], variant: s.matchRowVariant ?? 'compact' }, 'Fixtures')]
      break
    case 'standings':
      main = [layerOf({ type: 'fscard:standings', compKey, group: s.pickedGroup || null }, 'Standings')]
      break
    case 'form':
      main = [layerOf({ type: 'fscard:form', compKey, teamSlug: s.pickedTeamSlug }, 'Form grid')]
      break
    case 'news-image':
      main = [layerOf({ type: 'fscard:news-image', newsId: s.pickedNewsId }, 'News image')]
      break
    case 'news-article':
      main = [layerOf({ type: 'fscard:news-article', newsId: s.pickedNewsId }, 'News article')]
      break
    case 'ai-image':
      main = [layerOf({ type: 'fscard:ai-image', dataUrl: s.aiDataUrl, caption: s.aiCaption }, 'AI image')]
      break
    default:
      main = []
  }
  const ratio = s.ratio
  const ar = OUTPUT_SIZE[ratio].w / OUTPUT_SIZE[ratio].h
  main = main.map((l) => ({ ...l, transform: migratedTransform(l.layer.type, ratio) }))
  const badges = (s.overlays ?? []).map((o) => ({
    ...layerOf(
      { type: 'fscard:badge', url: o.url, kind: o.kind, label: o.label, xPct: o.xPct, yPct: o.yPct, widthPct: o.widthPct },
      o.label || 'Badge',
    ),
    transform: {
      xPct: o.xPct,
      yPct: o.yPct,
      widthPct: o.widthPct,
      heightPct: o.widthPct * ar,
      scale: 1,
      rotation: 0,
      opacity: 1,
    },
  }))
  return [...main, ...badges]
}

// ── styling ──────────────────────────────────────────────────────────────────
const labelCls = 'block text-[11px] font-medium text-neutral-400'
const selectCls =
  'mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30'
const inputCls = selectCls
const actionBtn =
  'shrink-0 whitespace-nowrap rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40'

type EditorTab = 'layers' | 'setup' | 'image' | 'aura' | 'publish'
const TABS: Array<{ id: EditorTab; label: string; short: string; Icon: PhosphorIcon }> = [
  { id: 'layers', label: 'Layers', short: 'Layers', Icon: Stack },
  { id: 'setup', label: 'Card setup', short: 'Setup', Icon: FrameCorners },
  { id: 'image', label: 'Image background', short: 'Image', Icon: ImageIcon },
  { id: 'aura', label: 'Aura background', short: 'Aura', Icon: Sparkle },
  { id: 'publish', label: 'Publish', short: 'Publish', Icon: PaperPlaneTilt },
]
// Tab control: a vertical icon rail on desktop, a horizontal labelled bottom bar
// on mobile (each button stretches to share the bar width).
const tabBtn = (active: boolean) =>
  [
    'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[10px] leading-none transition-colors',
    active ? 'text-sky-400' : 'text-neutral-400',
    'md:h-10 md:w-10 md:flex-none md:flex-row md:gap-0 md:border md:py-0',
    active
      ? 'md:border-sky-400/60 md:bg-white/10 md:text-white'
      : 'md:border-transparent md:text-neutral-400 md:hover:bg-white/5 md:hover:text-neutral-200',
  ].join(' ')
// Shared chrome for the two mobile bottom sheets (detail rail + layer edit); the
// `md:` resets in each usage strip it back to a plain in-flow column on desktop.
// z-50 keeps the sheet (and its tap targets) above the canvas' FreeTransformLayer
// drag overlay (`absolute inset-0 z-40`), which on mobile spans the full-width
// preview and would otherwise sit on top of the sheet's controls and swallow taps.
// Sheet sits fully above the fixed bottom tab bar: its bottom edge clears the
// bar's height plus the device safe-area inset (so it never tucks underneath).
const sheetCls =
  'fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-50 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-neutral-950 px-4 pb-5 pt-3 shadow-2xl'

// Mobile = below the `md` (768px) breakpoint, where the side panels collapse into
// draggable bottom sheets. Used to gate the drag-to-resize behaviour and the
// tabbed config layout (both are no-ops on the inline desktop columns).
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isMobile
}

// Snap heights (in vh) the sheet settles to after a drag — peek / default / tall.
const SHEET_SNAPS = [30, 45, 82]
const SHEET_DEFAULT_VH = 45

/** A bottom sheet that, on mobile, can be dragged by its grab handle to resize
 *  (so it stops covering the canvas) and snaps to {@link SHEET_SNAPS}. On desktop
 *  the `desktopClassName` md: resets turn it back into a plain inline column and
 *  the handle/drag are hidden, leaving height auto. */
function DraggableSheet({
  open,
  title,
  onClose,
  isMobile,
  desktopClassName,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  isMobile: boolean
  desktopClassName: string
  children: ReactNode
}) {
  const [heightVh, setHeightVh] = useState(SHEET_DEFAULT_VH)
  const drag = useRef<{ y: number; h: number } | null>(null)

  const onPointerDown = (e: ReactPointerEvent) => {
    drag.current = { y: e.clientY, h: heightVh }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    const dy = ((drag.current.y - e.clientY) / window.innerHeight) * 100
    setHeightVh(Math.min(88, Math.max(18, drag.current.h + dy)))
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    if (!drag.current) return
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    setHeightVh((h) => SHEET_SNAPS.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a)))
  }

  return (
    <div
      className={`${open ? 'flex flex-col' : 'hidden'} ${sheetCls} ${desktopClassName}`}
      style={isMobile && open ? { height: `${heightVh}vh`, maxHeight: '88vh' } : undefined}
    >
      {/* grab handle + title row — pinned to the top of the scroll area on mobile,
          stripped out on desktop (md:hidden). */}
      <div className="sticky top-0 z-10 -mx-4 -mt-3 mb-2 shrink-0 bg-neutral-950 px-4 pt-2 md:hidden">
        <div
          className="flex touch-none cursor-grab justify-center py-1 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-200">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}

export function ShareCardCreator({ initialCompetitions }: { initialCompetitions: CompetitionOption[] }) {
  const competitions = initialCompetitions

  // composer state (the card == an ordered stack of fscard:* layers)
  const [composer, setComposer] = useState<ComposerState>({ layers: [], background: null })
  const layers = composer.layers
  const [selection, setSelection] = useState<ComposerSelection>(null)
  const [multiSel, setMultiSel] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<EditorTab>('layers')
  // Which bottom sheet is open on mobile: the detail rail ('panel') or the
  // layer-edit panel ('config'). On desktop both render inline (md: classes
  // override the hidden state) so this only drives the mobile overlays.
  const [mobileSheet, setMobileSheet] = useState<'panel' | 'config' | null>(null)
  const isMobile = useIsMobile()

  // card-level frame controls
  const [themeName, setThemeName] = useState<ThemeName>('terrace')
  // Per-card theme override (base preset + per-token colors + fonts).
  const [themeOverride, setThemeOverride] = useState<CardThemeOverride | undefined>(undefined)
  const [ratio, setRatio] = useState<AspectRatio>('4:5')
  const [accentHex, setAccentHex] = useState('')
  const [handle, setHandle] = useState('@footshorts_app')
  const [logoSize, setLogoSize] = useState<LogoSize>('md')
  const [logoVariant, setLogoVariant] = useState<LogoVariant>('mark')
  const [eyebrowOverride, setEyebrowOverride] = useState('')
  const [showEyebrow, setShowEyebrow] = useState(true)
  // Card-level decorative background (behind the layer stack): image (news /
  // upload / AI) or an animated aura.
  const [background, setBackground] = useState<CardBackground>({ type: 'none' })
  const [backgroundScrim, setBackgroundScrim] = useState(0.5)
  const [auraSlug, setAuraSlug] = useState('')

  // card library + publish
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [currentCardId, setCurrentCardId] = useState<string | null>(null)
  const [currentCardName, setCurrentCardName] = useState('')
  const [showSavedModal, setShowSavedModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [shipping, setShipping] = useState(false)
  const [shipError, setShipError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  // publish entity tags (seeded from the layers; editable before ship)
  const [tags, setTags] = useState<EntityResult[]>([])
  const [tagQuery, setTagQuery] = useState('')
  const [tagResults, setTagResults] = useState<EntityResult[]>([])
  const [tagLoading, setTagLoading] = useState(false)
  const pendingTagsRef = useRef<EntityResult[] | null>(null)

  // The Image-background tab's picker browses news thumbnails (and uses them as
  // AI references), so pull the news feed while it's open even with no news layer.
  const data = useFootshortsCardData({ layers, competitions, ratio, forceNews: activeTab === 'image' })
  const hasLayers = layers.length > 0
  const representativeType = layers[0] ? String(layers[0].layer.type).replace('fscard:', '') : 'match'

  // Eyebrow: the first layer's competition name, else its news publisher.
  const eyebrow = useMemo(() => {
    if (!showEyebrow) return null
    if (eyebrowOverride.trim()) return eyebrowOverride.trim()
    const first = layers[0]?.layer
    if (first) {
      const ck = first.compKey
      if (typeof ck === 'string' && data.compMeta[ck]) return data.compMeta[ck].name
      const nid = first.newsId
      if (typeof nid === 'string') {
        const item = data.news.find((n) => n.id === nid)
        if (item?.publisher) return item.publisher
      }
    }
    return null
  }, [showEyebrow, eyebrowOverride, layers, data])

  // Base preset + override → full theme, shared by the card frame, the capture
  // background color, and the Google-Fonts import below.
  const resolvedTheme = useMemo(() => resolveTheme(themeOverride, themeName), [themeOverride, themeName])
  // Load the chosen font families (base or override) so both the live preview and
  // the html-to-image capture render them. `getFontImportUrl` wants bare family
  // names, so take the first family of each CSS stack (and map display→serif).
  const fontImportUrl = useMemo(() => {
    const ff = resolvedTheme.typography.fontFamily
    const first = (stack: string) => stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? ''
    return getFontImportUrl({ sans: first(ff.sans), serif: first(ff.display), mono: first(ff.mono) })
  }, [resolvedTheme])

  const frame: CardFrameConfig = useMemo(
    () => ({
      themeName,
      themeOverride,
      ratio,
      accentHex: accentHex || null,
      eyebrow,
      handle,
      logoSize,
      logoVariant,
      captionColor: '#FFFFFF',
      gradientStrength: 0.6,
      background,
      backgroundScrim,
    }),
    [themeName, themeOverride, ratio, accentHex, eyebrow, handle, logoSize, logoVariant, background, backgroundScrim],
  )

  const ctx: FootshortsComposerCtx = useMemo(
    () => ({ competitions, data, frame }),
    [competitions, data, frame],
  )
  // Select a layer/group and, on mobile, slide up the layer-edit sheet (or
  // dismiss it when the selection clears). Harmless on desktop, where the edit
  // panel is always shown inline.
  const handleSelect = useCallback((sel: ComposerSelection) => {
    setSelection(sel)
    setMobileSheet((cur) => (sel ? 'config' : cur === 'config' ? null : cur))
  }, [])

  const onChange = useCallback((next: ComposerState) => setComposer(next), [])
  const onToggleMulti = useCallback(
    (id: string) => setMultiSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  )

  // Add-layer types offered (the footshorts foreground modules).
  const addTypes = useMemo(() => {
    const allowed = new Set(footshortsHost.allowedModuleTypes(ctx))
    return listModulesForSlot('foreground')
      .map((m) => m.type)
      .filter((t) => allowed.has(t))
  }, [ctx])
  const handleAddLayer = useCallback(
    (type: string) => {
      const layer = footshortsHost.makeLayer(type, ctx)
      setComposer((c) => addLayer(c, layer))
      handleSelect({ kind: 'layer', id: layer.id })
    },
    [ctx, handleSelect],
  )
  const handleLayerConfig = useCallback(
    (id: string, layer: VizLayer) => setComposer((c) => setLayerConfig(c, id, layer)),
    [],
  )
  const handleLayerTransform = useCallback(
    (id: string, patch: Partial<TransformLike>) => setComposer((c) => patchLayerTransform(c, id, patch)),
    [],
  )
  const handleLayerBox = useCallback(
    (id: string, patch: Partial<LayerBox>) => setComposer((c) => patchLayerBox(c, id, patch)),
    [],
  )

  // capture / export
  const captureRef = useRef<HTMLDivElement>(null)
  const out = OUTPUT_SIZE[ratio]
  const renderW = Math.round(out.w * RENDER_SCALE)
  const renderH = Math.round(out.h * RENDER_SCALE)
  const pixelRatio = out.w / renderW
  const bgHex = resolvedTheme.colors.bg
  const { capture, download } = useCapture(captureRef, {
    width: renderW,
    height: renderH,
    pixelRatio,
    backgroundColor: bgHex,
  })

  // Entity tags suggested by the layers (the teams in a match, the competition of
  // a table, a news item's entities) — sent with the ship payload.
  const suggestedTags = useMemo<EntityResult[]>(() => {
    const out: EntityResult[] = []
    const seen = new Set<string>()
    const push = (t: EntityResult | null) => {
      if (!t || !t.slug) return
      const k = `${t.type}:${t.slug}`
      if (!seen.has(k)) {
        seen.add(k)
        out.push(t)
      }
    }
    const compByKey = new Map(competitions.map((c) => [compKeyOf(c), c]))
    for (const l of layers) {
      const cfg = l.layer
      const ck = typeof cfg.compKey === 'string' ? cfg.compKey : ''
      const comp = ck ? compByKey.get(ck) : undefined
      if (comp) push({ id: '', type: 'league', slug: comp.slug, name: comp.name, crest_url: null })
      if ((cfg.type === 'fscard:match' || cfg.type === 'fscard:match-timeline') && typeof cfg.fixtureId === 'string') {
        const f = (data.fixturesByComp[ck] ?? []).find((x) => x.id === cfg.fixtureId)
        if (f?.home) push({ id: f.home.id, type: 'team', slug: f.home.slug, name: f.home.name, crest_url: f.home.crest_url })
        if (f?.away) push({ id: f.away.id, type: 'team', slug: f.away.slug, name: f.away.name, crest_url: f.away.crest_url })
      }
      if (cfg.type === 'fscard:form' && typeof cfg.teamSlug === 'string' && cfg.teamSlug) {
        const f = (data.fixturesByComp[ck] ?? []).find(
          (x) => x.home?.slug === cfg.teamSlug || x.away?.slug === cfg.teamSlug,
        )
        const ref = f?.home?.slug === cfg.teamSlug ? f?.home : f?.away
        push({ id: ref?.id ?? '', type: 'team', slug: cfg.teamSlug, name: ref?.name ?? cfg.teamSlug, crest_url: ref?.crest_url ?? null })
      }
      if ((cfg.type === 'fscard:news-image' || cfg.type === 'fscard:news-article') && typeof cfg.newsId === 'string') {
        const item = data.news.find((n) => n.id === cfg.newsId)
        for (const e of item?.entities ?? []) {
          if (e.type === 'team' || e.type === 'league') {
            push({ id: e.id, type: e.type, slug: e.slug, name: e.name, crest_url: e.crest_url })
          }
        }
      }
    }
    return out
  }, [layers, competitions, data])

  // Re-seed publish tags when the layers' content changes; a loaded card restores
  // its own saved tags via pendingTagsRef instead.
  const tagKey = layers
    .map((l) => `${l.layer.type}:${l.layer.compKey ?? ''}:${l.layer.fixtureId ?? ''}:${l.layer.teamSlug ?? ''}:${l.layer.newsId ?? ''}`)
    .join('|')
  useEffect(() => {
    if (pendingTagsRef.current) {
      setTags(pendingTagsRef.current)
      pendingTagsRef.current = null
    } else {
      setTags(suggestedTags)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagKey])

  const searchTags = useCallback(async () => {
    setTagLoading(true)
    try {
      const res = await fetch(`/api/footshorts/data/entities?q=${encodeURIComponent(tagQuery.trim())}&limit=20`)
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: EntityResult[] }
      setTagResults(body.items ?? [])
    } catch {
      setTagResults([])
    } finally {
      setTagLoading(false)
    }
  }, [tagQuery])

  const addTag = useCallback(
    (t: EntityResult) =>
      setTags((prev) => (prev.some((p) => p.type === t.type && p.slug === t.slug) ? prev : [...prev, t])),
    [],
  )
  const removeTag = useCallback(
    (type: string, slug: string) => setTags((prev) => prev.filter((p) => !(p.type === type && p.slug === slug))),
    [],
  )

  // Palette hints handed to the image picker's AI generation so output stays on
  // brand (the resolved accent + any per-card accent override).
  const bgPaletteHexes = useMemo(
    () => [resolvedTheme.colors.accent, accentHex].filter(Boolean),
    [resolvedTheme, accentHex],
  )

  // Thumbnail of the current image-ish background, for the Image tab preview.
  const bgPreviewSrc =
    background.type === 'image'
      ? background.src.startsWith('data:')
        ? background.src
        : proxiedImage(background.src)
      : background.type === 'ai'
        ? background.dataUrl
        : background.type === 'news'
          ? proxiedImage(background.url)
          : null

  // Scrim darkens whatever backdrop is set, for legibility — shared by both the
  // Image and Aura tabs since it's a property of the background regardless of kind.
  const scrimControl =
    background.type !== 'none' ? (
      <label className={labelCls}>
        {`Scrim ${Math.round(backgroundScrim * 100)}%`}
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(backgroundScrim * 100)}
          onChange={(e) => setBackgroundScrim(Number(e.target.value) / 100)}
          className="mt-1 w-full"
        />
      </label>
    ) : null

  // ── snapshot save / load ────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/footshorts/share/cards')
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

  const buildSnapshot = useCallback(
    (): ShareCardSnapshotV2 => ({
      version: 2,
      themeName,
      themeOverride,
      ratio,
      accentHex,
      handle,
      logoSize,
      logoVariant,
      eyebrowOverride,
      showEyebrow,
      background,
      backgroundScrim,
      foreground: composer.layers,
      groups: composer.groups,
    }),
    [themeName, themeOverride, ratio, accentHex, handle, logoSize, logoVariant, eyebrowOverride, showEyebrow, background, backgroundScrim, composer],
  )

  const applySnapshot = useCallback((snap: AnySnapshot) => {
    setThemeName(snap.themeName)
    setThemeOverride(snap.version === 2 ? snap.themeOverride : undefined)
    setRatio(snap.ratio)
    setAccentHex(snap.accentHex)
    setHandle(snap.handle)
    setLogoSize(snap.logoSize)
    setLogoVariant(snap.logoVariant)
    setEyebrowOverride(snap.eyebrowOverride)
    setShowEyebrow(snap.showEyebrow)
    const bg = snap.background ?? { type: 'none' }
    setBackground(bg)
    setBackgroundScrim(snap.backgroundScrim ?? 0.5)
    if (bg.type === 'aura') setAuraSlug(bg.slug)
    setComposer(
      normalizeGroupContiguity({
        layers: snap.version === 2 ? (snap.foreground ?? []) : v1ToForeground(snap),
        background: null,
        groups: snap.version === 2 ? snap.groups : undefined,
      }),
    )
    setMultiSel([])
    setSelection(null)
    setSaveError(null)
  }, [])

  const handleDownload = useCallback(async () => {
    if (!hasLayers) return
    setDownloading(true)
    try {
      await download(`footshorts-${representativeType}-${ratio.replace(':', 'x')}.png`)
    } finally {
      setDownloading(false)
    }
  }, [hasLayers, download, representativeType, ratio])

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!hasLayers) return false

    // Editing an already-saved card → overwrite it in place (keep its name, no
    // prompt) so re-saving updates the same row instead of piling up duplicates.
    if (currentCardId) {
      setSaving(true)
      setSaveError(null)
      try {
        const res = await fetch(`/api/footshorts/share/cards/${currentCardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardType: representativeType, config: buildSnapshot() }),
        })
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; card?: SavedCard; error?: string }
        if (!res.ok || !body.ok || !body.card) throw new Error(body.error ?? `HTTP ${res.status}`)
        setSavedCards((prev) => prev.map((c) => (c.id === body.card!.id ? body.card! : c)))
        setCurrentCardName(body.card.name)
        return true
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Save failed')
        return false
      } finally {
        setSaving(false)
      }
    }

    // New (unsaved) card → name it and create a fresh row.
    const name = window.prompt('Name this card', currentCardName || 'Footshorts card')?.trim()
    if (!name) return false
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/footshorts/share/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, cardType: representativeType, config: buildSnapshot() }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; card?: SavedCard; error?: string }
      if (!res.ok || !body.ok || !body.card) throw new Error(body.error ?? `HTTP ${res.status}`)
      setSavedCards((prev) => [body.card!, ...prev])
      setCurrentCardId(body.card.id)
      setCurrentCardName(body.card.name)
      return true
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }, [hasLayers, currentCardId, currentCardName, representativeType, buildSnapshot])

  // Reset the editor to a blank, unsaved card. Brand/frame settings (theme,
  // ratio, handle, logo) carry over so the next card starts from the same studio
  // setup; everything that identifies *this* card is cleared.
  const resetCard = useCallback(() => {
    setComposer({ layers: [], background: null })
    setSelection(null)
    setMultiSel([])
    setBackground({ type: 'none' })
    setBackgroundScrim(0.5)
    setAuraSlug('')
    pendingTagsRef.current = null
    setTags([])
    setCurrentCardId(null)
    setCurrentCardName('')
    setSaveError(null)
    setShipError(null)
  }, [])

  // Plus button: offer to save the current card's progress, then start fresh.
  const handleNewCard = useCallback(async () => {
    if (hasLayers) {
      const save = window.confirm(
        'Save the current card before starting a new one?\n\nOK = save first · Cancel = discard changes',
      )
      if (save && !(await handleSave())) return // save cancelled / failed → stay put
    }
    resetCard()
  }, [hasLayers, handleSave, resetCard])

  // Duplicate: keep all current content + frame, but detach from the saved record
  // so the next Save creates a new card instead of overwriting the original.
  const handleDuplicate = useCallback(() => {
    if (!hasLayers) return
    setCurrentCardId(null)
    setCurrentCardName((n) => (n.trim() ? `${n.trim()} copy` : 'Footshorts card copy'))
    setSelection(null)
    setMultiSel([])
    setSaveError(null)
    setShipError(null)
  }, [hasLayers])

  const loadCard = useCallback(
    (card: SavedCard) => {
      const restored: EntityResult[] = (card.entities ?? [])
        .filter((e) => e.type === 'team' || e.type === 'league')
        .map((e) => ({ id: e.id, type: e.type as 'team' | 'league', slug: e.slug, name: e.name, crest_url: e.crestUrl }))
      setTags(restored)
      pendingTagsRef.current = restored
      applySnapshot(card.config)
      setCurrentCardId(card.id)
      setCurrentCardName(card.name)
    },
    [applySnapshot],
  )

  const handleDeleteSaved = useCallback(async (id: string) => {
    setSavedCards((prev) => prev.filter((c) => c.id !== id))
    setCurrentCardId((cur) => (cur === id ? null : cur))
    try {
      await fetch(`/api/footshorts/share/cards/${id}`, { method: 'DELETE' })
    } catch {
      /* optimistic */
    }
  }, [])

  const handleShip = useCallback(async () => {
    if (!hasLayers) return
    const name = window
      .prompt('Name this card (shown in the product)', currentCardName || 'Footshorts card')
      ?.trim()
    if (!name) return
    setShipping(true)
    setShipError(null)
    try {
      const dataUrl = await capture()
      if (!dataUrl) throw new Error('Could not render the card image.')
      const res = await fetch('/api/footshorts/share/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentCardId ?? undefined,
          name,
          cardType: representativeType,
          config: buildSnapshot(),
          ratio,
          imageDataUrl: dataUrl,
          entities: tags.map((t) => ({ type: t.type, slug: t.slug })),
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; card?: SavedCard; error?: string }
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      if (body.card) {
        setCurrentCardId(body.card.id)
        setCurrentCardName(body.card.name)
      }
    } catch (e) {
      setShipError(e instanceof Error ? e.message : 'Ship failed')
    } finally {
      setShipping(false)
    }
  }, [hasLayers, currentCardName, representativeType, buildSnapshot, capture, currentCardId, ratio, tags])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-5 text-neutral-200">
      {/* Load the resolved theme's Google fonts for both preview + PNG capture. */}
      {fontImportUrl && <link rel="stylesheet" href={fontImportUrl} />}
      <div className="flex shrink-0 flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-neutral-100">Share card composer</h1>
          <p className="text-[11px] text-neutral-500">
            {currentCardName
              ? `Editing “${currentCardName}”${currentCardId ? '' : ' · unsaved copy'}`
              : 'Free-position layers — match, standings, news, badges — on one card.'}
          </p>
        </div>
        {/* Action bar — horizontally scrollable on mobile so the full button set
            stays reachable without wrapping. */}
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:overflow-visible md:px-0 md:pb-0">
          <button
            className={`${actionBtn} inline-flex items-center gap-1.5`}
            title="New card"
            onClick={() => void handleNewCard()}
          >
            <Plus size={14} weight="bold" />
            New
          </button>
          <button
            className={`${actionBtn} inline-flex items-center gap-1.5`}
            title="Duplicate current card"
            disabled={!hasLayers}
            onClick={handleDuplicate}
          >
            <CopySimple size={14} />
            Duplicate
          </button>
          <button
            className={`${actionBtn} inline-flex items-center gap-1.5`}
            title="Open a saved card"
            onClick={() => setShowSavedModal(true)}
          >
            <FolderOpen size={14} />
            Saved cards{savedCards.length ? ` (${savedCards.length})` : ''}
          </button>
          <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
          <button className={actionBtn} disabled={!hasLayers || downloading} onClick={handleDownload}>
            {downloading ? 'Rendering…' : 'Download PNG'}
          </button>
          <button className={actionBtn} disabled={!hasLayers || saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className={actionBtn} disabled={!hasLayers || shipping} onClick={handleShip}>
            {shipping ? 'Shipping…' : 'Ship to product'}
          </button>
        </div>
      </div>
      {(saveError || shipError) && (
        <p className="shrink-0 text-[11px] text-red-400">{saveError ?? shipError}</p>
      )}

      <div className="flex min-h-0 flex-1 gap-4 pb-20 md:pb-0">
        {/* left: icon rail + active panel. On mobile the rail drops to a fixed
            bottom bar and the panel becomes a bottom sheet — `contents` removes
            this wrapper from the flow so the center preview spans full width. */}
        <div className="contents md:flex md:w-96 md:shrink-0 md:gap-2">
          {/* icon rail (desktop) / bottom tab bar (mobile) */}
          <div className="fixed inset-x-0 bottom-0 z-50 flex items-stretch gap-1 border-t border-white/10 bg-neutral-950/95 px-2 py-1.5 pb-[max(env(safe-area-inset-bottom),0.375rem)] backdrop-blur md:static md:z-auto md:flex-col md:gap-1.5 md:border-0 md:bg-transparent md:px-0 md:py-0 md:pb-0 md:backdrop-blur-none">
            {TABS.map(({ id, label, short, Icon }) => {
              const active = activeTab === id
              return (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => {
                    setActiveTab(id)
                    // Toggle the detail sheet on mobile; on desktop the panel is
                    // always inline so this just tracks intent.
                    setMobileSheet((cur) => (cur === 'panel' && active ? null : 'panel'))
                  }}
                  className={tabBtn(active)}
                >
                  <Icon size={18} weight={active ? 'fill' : 'regular'} />
                  <span className="md:hidden">{short}</span>
                </button>
              )
            })}
          </div>
          {/* active panel (detail rail) — draggable bottom sheet on mobile, inline column on desktop */}
          <DraggableSheet
            open={mobileSheet === 'panel'}
            title={TABS.find((t) => t.id === activeTab)?.label ?? ''}
            onClose={() => setMobileSheet(null)}
            isMobile={isMobile}
            desktopClassName="md:static md:bottom-auto md:z-auto md:block md:max-h-none md:min-w-0 md:flex-1 md:space-y-4 md:overflow-y-auto md:rounded-none md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pr-1 md:pt-0 md:shadow-none"
          >
            {activeTab === 'layers' && (
              <LayerListPanel
                state={composer}
                selection={selection}
                multiSel={multiSel}
                addTypes={addTypes}
                hasBackground={false}
                onChange={onChange}
                onSelect={handleSelect}
                onToggleMulti={onToggleMulti}
                onClearMulti={() => setMultiSel([])}
                onAdd={handleAddLayer}
              />
            )}
            {activeTab === 'setup' && (
              <div className="space-y-4">
                {/* theme: base preset + per-token colors + fonts */}
                <div className="rounded-lg border border-white/10 p-3">
                  <ThemePanel
                    theme={resolvedTheme}
                    themeName={themeName}
                    override={themeOverride}
                    onPickPreset={(name) => {
                      setThemeName(name)
                      setThemeOverride(undefined)
                    }}
                    onChange={setThemeOverride}
                    onReset={() => setThemeOverride(undefined)}
                  />
                </div>
                {/* card-level frame controls */}
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 p-3">
                  <label className={labelCls}>
                    Format
                    <select className={selectCls} value={ratio} onChange={(e) => setRatio(e.target.value as AspectRatio)}>
                      {ASPECT_RATIOS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelCls}>
                    Accent (hex)
                    <input className={inputCls} placeholder="#RRGGBB" value={accentHex} onChange={(e) => setAccentHex(e.target.value)} />
                  </label>
                  <label className={labelCls}>
                    Handle
                    <input className={inputCls} value={handle} onChange={(e) => setHandle(e.target.value)} />
                  </label>
                  <label className={labelCls}>
                    Logo size
                    <select className={selectCls} value={logoSize} onChange={(e) => setLogoSize(e.target.value as LogoSize)}>
                      {LOGO_SIZES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelCls}>
                    Logo style
                    <select className={selectCls} value={logoVariant} onChange={(e) => setLogoVariant(e.target.value as LogoVariant)}>
                      {LOGO_VARIANTS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelCls}>
                    Eyebrow override
                    <input className={inputCls} placeholder="(auto)" value={eyebrowOverride} onChange={(e) => setEyebrowOverride(e.target.value)} />
                  </label>
                  <label className="flex items-end gap-2 text-[11px] text-neutral-400">
                    <input type="checkbox" checked={showEyebrow} onChange={(e) => setShowEyebrow(e.target.checked)} />
                    Show eyebrow
                  </label>
                </div>
              </div>
            )}
            {activeTab === 'image' && (
              <div className="space-y-4">
                {/* Image backdrop (behind the layer stack): news thumbnail / upload /
                    AI generation (with an optional reference drawn from the news feed). */}
                <div className="flex flex-col gap-3 rounded-lg border border-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className={labelCls}>Image background</span>
                    {background.type === 'image' && (
                      <button
                        className="text-[11px] text-neutral-400 underline"
                        onClick={() => setBackground({ type: 'none' })}
                      >
                        clear
                      </button>
                    )}
                  </div>

                  {bgPreviewSrc && (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={bgPreviewSrc} alt="" className="h-12 w-12 rounded border border-white/10 object-cover" />
                      <span className="text-[11px] text-neutral-500">Image background set</span>
                    </div>
                  )}

                  <ImagePicker
                    ratio={ratio}
                    paletteHexes={bgPaletteHexes}
                    news={data.news}
                    onPick={(src) => {
                      setBackground({ type: 'image', src })
                      setAuraSlug('')
                    }}
                  />

                  {scrimControl}
                </div>
              </div>
            )}
            {activeTab === 'aura' && (
              <div className="space-y-4">
                {/* Aura backdrop: an animated embed — shows in the live preview only,
                    never rasterized into the exported PNG. */}
                <div className="flex flex-col gap-3 rounded-lg border border-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className={labelCls}>Aura background</span>
                    {background.type === 'aura' && (
                      <button
                        className="text-[11px] text-neutral-400 underline"
                        onClick={() => {
                          setBackground({ type: 'none' })
                          setAuraSlug('')
                        }}
                      >
                        clear
                      </button>
                    )}
                  </div>

                  <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                    Aura animates in the live preview only. Attach a poster image below — that’s what lands in the exported PNG.
                  </p>

                  <label className={labelCls}>
                    Aura slug
                    <input
                      className={inputCls}
                      placeholder="(none)"
                      value={auraSlug}
                      onChange={(e) => {
                        const v = e.target.value
                        setAuraSlug(v)
                        setBackground(
                          v.trim()
                            ? {
                                type: 'aura',
                                slug: v.trim(),
                                // Keep any poster already attached when only the slug changes.
                                posterSrc: background.type === 'aura' ? background.posterSrc : undefined,
                              }
                            : { type: 'none' },
                        )
                      }}
                    />
                  </label>

                  {background.type === 'aura' && (
                    <div className="flex flex-col gap-2">
                      <span className={labelCls}>Poster image (for export)</span>
                      {background.posterSrc && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={background.posterSrc.startsWith('data:') ? background.posterSrc : proxiedImage(background.posterSrc)}
                          alt=""
                          className="h-16 w-full rounded border border-white/10 object-cover"
                        />
                      )}
                      <ImagePicker
                        ratio={ratio}
                        paletteHexes={bgPaletteHexes}
                        news={data.news}
                        onPick={(src) => setBackground({ type: 'aura', slug: background.slug, posterSrc: src })}
                      />
                    </div>
                  )}

                  {scrimControl}
                </div>
              </div>
            )}
            {activeTab === 'publish' && (
              <div className="space-y-4">
                {/* publish tags */}
                <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-3">
                  <span className={labelCls}>Publish tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span
                        key={`${t.type}:${t.slug}`}
                        className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-neutral-200"
                      >
                        {t.name}
                        <button className="text-neutral-500 hover:text-red-400" onClick={() => removeTag(t.type, t.slug)}>
                          ×
                        </button>
                      </span>
                    ))}
                    {tags.length === 0 && (
                      <span className="text-[11px] text-neutral-600">No tags — search to add teams / leagues.</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <input
                      className={inputCls}
                      placeholder="Search teams / leagues…"
                      value={tagQuery}
                      onChange={(e) => setTagQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void searchTags()}
                    />
                    <button className={actionBtn} onClick={() => void searchTags()}>
                      {tagLoading ? '…' : 'Search'}
                    </button>
                  </div>
                  {tagResults.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tagResults.map((r) => (
                        <button
                          key={`${r.type}:${r.slug}`}
                          className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-white/5"
                          onClick={() => addTag(r)}
                        >
                          + {r.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DraggableSheet>
        </div>
        {/* center: live preview (drag / resize / rotate / group) */}
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-white/5 bg-neutral-950/40 p-2 md:p-4">
          <PreviewPane
            host={footshortsHost}
            state={composer}
            ctx={ctx}
            captureRef={captureRef}
            selection={selection}
            multiSel={multiSel}
            onSelect={handleSelect}
            onToggleMulti={onToggleMulti}
            onChange={onChange}
          />
        </div>
        {/* right: selected-layer properties — draggable bottom sheet on mobile, inline column on desktop */}
        <DraggableSheet
          open={mobileSheet === 'config'}
          title="Layer"
          onClose={() => setMobileSheet(null)}
          isMobile={isMobile}
          desktopClassName="md:static md:bottom-auto md:z-auto md:block md:max-h-none md:w-80 md:shrink-0 md:space-y-3 md:overflow-y-auto md:rounded-none md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pl-1 md:pt-0 md:shadow-none"
        >
          <ConfigPanel
            host={footshortsHost}
            state={composer}
            selection={selection}
            ctx={ctx}
            layout={isMobile ? 'tabbed' : 'stacked'}
            onLayerConfigChange={handleLayerConfig}
            onLayerTransformChange={handleLayerTransform}
            onLayerBoxChange={handleLayerBox}
            onBackgroundChange={() => undefined}
          />
        </DraggableSheet>
      </div>

      {/* mobile sheet backdrop — tap to dismiss either bottom sheet. z-[45] sits
          above the canvas drag overlay (z-40) so it masks the preview's transform
          handles while a sheet is open, and below the sheet itself (z-50). */}
      {mobileSheet && (
        <div
          className="fixed inset-0 z-[45] bg-black/40 md:hidden"
          onClick={() => setMobileSheet(null)}
        />
      )}

      {showSavedModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowSavedModal(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950 text-neutral-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">Saved cards</h2>
                <p className="truncate text-[11px] text-neutral-500">Open a saved card or remove it.</p>
              </div>
              <button
                onClick={() => setShowSavedModal(false)}
                className="shrink-0 rounded-md p-1.5 leading-none text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {savedCards.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
                  No saved cards yet — build one and hit Save.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {savedCards.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${currentCardId === c.id ? 'bg-white/10 text-neutral-100' : 'text-neutral-300 hover:bg-white/5'
                        }`}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => {
                          loadCard(c)
                          setShowSavedModal(false)
                        }}
                      >
                        <span className="truncate">{c.name}</span>
                        {currentCardId === c.id && <span className="shrink-0 text-[10px] text-sky-400">current</span>}
                      </button>
                      <button
                        className="shrink-0 rounded p-1 text-neutral-500 hover:bg-white/10 hover:text-red-400"
                        title="Delete card"
                        onClick={() => void handleDeleteSaved(c.id)}
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
