'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EventTypeFilter } from '@vismay/footshorts-viz/types'
import { listModulesForSlot, type VizLayer } from '@vismay/viz-engine'
import { FrameCorners, Image as ImageIcon, PaperPlaneTilt, Stack, type Icon as PhosphorIcon } from '@phosphor-icons/react'
import {
  LayerListPanel,
  ConfigPanel,
  PreviewPane,
  addLayer,
  setLayerConfig,
  patchLayerTransform,
  normalizeGroupContiguity,
  composerUid,
  type ComposerLayer,
  type ComposerSelection,
  type ComposerState,
  type LayerGroup,
  type TransformLike,
} from '@vismay/viz-admin'
import { themes, type ThemeName } from '@footshorts/brand'
import { useCapture } from './useCapture'
import {
  ASPECT_RATIOS,
  LOGO_SIZES,
  LOGO_VARIANTS,
  OUTPUT_SIZE,
  RENDER_SCALE,
  type AspectRatio,
  type CardBackground,
  type CardType,
  type CardFrameConfig,
  type LogoSize,
  type LogoVariant,
  type MatchRowVariant,
  type MatchStyle,
} from './types'
import { SHARE_IMAGE_STYLES } from '@/lib/footshortsShareStyles'
import { registerFootshortsShareCardModules } from './modules'
import { footshortsHost } from './composer/host'
import { registerFootshortsPickers } from './composer/pickers'
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
      main = [layerOf({ type: 'fscard:match-timeline', compKey, fixtureId: s.pickedFixtureId, matchStyle: s.matchStyle, eventFilter: s.pickedEventFilter ?? 'all' }, 'Match timeline')]
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
  'rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40'

const THEME_NAMES = Object.keys(themes) as ThemeName[]

type EditorTab = 'layers' | 'setup' | 'background' | 'publish'
const TABS: Array<{ id: EditorTab; label: string; Icon: PhosphorIcon }> = [
  { id: 'layers', label: 'Layers', Icon: Stack },
  { id: 'setup', label: 'Card setup', Icon: FrameCorners },
  { id: 'background', label: 'Background', Icon: ImageIcon },
  { id: 'publish', label: 'Publish', Icon: PaperPlaneTilt },
]
const railBtn = (active: boolean) =>
  `flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
    active
      ? 'border-sky-400/60 bg-white/10 text-white'
      : 'border-transparent text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
  }`

export function ShareCardCreator({ initialCompetitions }: { initialCompetitions: CompetitionOption[] }) {
  const competitions = initialCompetitions

  // composer state (the card == an ordered stack of fscard:* layers)
  const [composer, setComposer] = useState<ComposerState>({ layers: [], background: null })
  const layers = composer.layers
  const [selection, setSelection] = useState<ComposerSelection>(null)
  const [multiSel, setMultiSel] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'layers' | 'setup' | 'background' | 'publish'>('layers')

  // card-level frame controls
  const [themeName, setThemeName] = useState<ThemeName>(THEME_NAMES[0] ?? 'classic')
  const [ratio, setRatio] = useState<AspectRatio>('1:1')
  const [accentHex, setAccentHex] = useState('')
  const [handle, setHandle] = useState('@footshorts')
  const [logoSize, setLogoSize] = useState<LogoSize>('md')
  const [logoVariant, setLogoVariant] = useState<LogoVariant>('accent')
  const [eyebrowOverride, setEyebrowOverride] = useState('')
  const [showEyebrow, setShowEyebrow] = useState(true)
  // Card-level decorative background (behind the layer stack): AI image or aura.
  const [background, setBackground] = useState<CardBackground>({ type: 'none' })
  const [backgroundScrim, setBackgroundScrim] = useState(0.5)
  const [bgSubject, setBgSubject] = useState('')
  const [auraSlug, setAuraSlug] = useState('')
  const [bgBusy, setBgBusy] = useState(false)
  const [bgError, setBgError] = useState<string | null>(null)

  // card library + publish
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [currentCardId, setCurrentCardId] = useState<string | null>(null)
  const [currentCardName, setCurrentCardName] = useState('')
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

  const data = useFootshortsCardData({ layers, competitions, ratio })
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

  const frame: CardFrameConfig = useMemo(
    () => ({
      themeName,
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
    [themeName, ratio, accentHex, eyebrow, handle, logoSize, logoVariant, background],
  )

  const ctx: FootshortsComposerCtx = useMemo(
    () => ({ competitions, data, frame }),
    [competitions, data, frame],
  )
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
      setSelection({ kind: 'layer', id: layer.id })
    },
    [ctx],
  )
  const handleLayerConfig = useCallback(
    (id: string, layer: VizLayer) => setComposer((c) => setLayerConfig(c, id, layer)),
    [],
  )
  const handleLayerTransform = useCallback(
    (id: string, patch: Partial<TransformLike>) => setComposer((c) => patchLayerTransform(c, id, patch)),
    [],
  )

  // capture / export
  const captureRef = useRef<HTMLDivElement>(null)
  const out = OUTPUT_SIZE[ratio]
  const renderW = Math.round(out.w * RENDER_SCALE)
  const renderH = Math.round(out.h * RENDER_SCALE)
  const pixelRatio = out.w / renderW
  const bgHex = themes[themeName].colors.bg
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

  const handleGenerateBg = useCallback(async () => {
    const s = bgSubject.trim()
    if (!s) {
      setBgError('Describe the background.')
      return
    }
    setBgBusy(true)
    setBgError(null)
    try {
      const paletteHexes = [themes[themeName].colors.accent, accentHex].filter(Boolean)
      const res = await fetch('/api/footshorts/share/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styleId: SHARE_IMAGE_STYLES[0]?.id, subject: s, ratio, model: 'image.default', paletteHexes }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; dataUrl?: string; error?: string }
      if (!res.ok || !body.ok || !body.dataUrl) throw new Error(body.error ?? `HTTP ${res.status}`)
      setBackground({ type: 'ai', dataUrl: body.dataUrl })
    } catch (e) {
      setBgError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setBgBusy(false)
    }
  }, [bgSubject, themeName, accentHex, ratio])

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
    [themeName, ratio, accentHex, handle, logoSize, logoVariant, eyebrowOverride, showEyebrow, background, composer],
  )

  const applySnapshot = useCallback((snap: AnySnapshot) => {
    setThemeName(snap.themeName)
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

  const handleSave = useCallback(async () => {
    if (!hasLayers) return
    const name = window.prompt('Name this card', currentCardName || 'Footshorts card')?.trim()
    if (!name) return
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
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [hasLayers, currentCardName, representativeType, buildSnapshot])

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
      <div className="flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-neutral-100">Share card composer</h1>
          <p className="text-[11px] text-neutral-500">
            Free-position layers — match, standings, news, badges — on one card.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={actionBtn} disabled={!hasLayers || downloading} onClick={handleDownload}>
            {downloading ? 'Rendering…' : 'Download PNG'}
          </button>
          <button className={actionBtn} disabled={!hasLayers || saving} onClick={handleSave}>
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

      <div className="flex min-h-0 flex-1 gap-4">
        {/* left: icon rail + active panel */}
        <div className="flex w-80 shrink-0 gap-2">
          <div className="flex shrink-0 flex-col gap-1.5">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                title={label}
                onClick={() => setActiveTab(id)}
                className={railBtn(activeTab === id)}
              >
                <Icon size={18} weight={activeTab === id ? 'fill' : 'regular'} />
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {activeTab === 'layers' && (
              <>
                <LayerListPanel
                  state={composer}
                  selection={selection}
                  multiSel={multiSel}
                  addTypes={addTypes}
                  hasBackground={false}
                  onChange={onChange}
                  onSelect={setSelection}
                  onToggleMulti={onToggleMulti}
                  onClearMulti={() => setMultiSel([])}
                  onAdd={handleAddLayer}
                />
                <ConfigPanel
                  host={footshortsHost}
                  state={composer}
                  selection={selection}
                  ctx={ctx}
                  onLayerConfigChange={handleLayerConfig}
                  onLayerTransformChange={handleLayerTransform}
                  onBackgroundChange={() => undefined}
                />
              </>
            )}
            {activeTab === 'setup' && (
              <div className="space-y-4">
      {/* card-level frame controls */}
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 p-3 sm:grid-cols-4">
        <label className={labelCls}>
          Theme
          <select className={selectCls} value={themeName} onChange={(e) => setThemeName(e.target.value as ThemeName)}>
            {THEME_NAMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
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
            {activeTab === 'background' && (
              <div className="space-y-4">
      {/* card background (behind the layer stack) */}
      <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-3">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Background (behind layers)</span>
          {background.type !== 'none' && (
            <button className="text-[11px] text-neutral-400 underline" onClick={() => setBackground({ type: 'none' })}>
              clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className={labelCls}>
            Aura slug
            <input
              className={inputCls}
              placeholder="(none)"
              value={auraSlug}
              onChange={(e) => {
                const v = e.target.value
                setAuraSlug(v)
                setBackground(v.trim() ? { type: 'aura', slug: v.trim() } : { type: 'none' })
              }}
            />
          </label>
          <label className={labelCls}>
            AI background
            <div className="mt-1 flex gap-1">
              <input className={inputCls} placeholder="describe…" value={bgSubject} onChange={(e) => setBgSubject(e.target.value)} />
              <button className={actionBtn} disabled={bgBusy} onClick={() => void handleGenerateBg()}>
                {bgBusy ? '…' : 'Gen'}
              </button>
            </div>
          </label>
        </div>
        {bgError && <p className="text-[11px] text-red-400">{bgError}</p>}
        {background.type !== 'none' && (
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
        )}
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

      {/* saved cards */}
      {savedCards.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>Saved cards</span>
          <div className="flex flex-col gap-1">
            {savedCards.map((c) => (
              <div
                key={c.id}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] ${
                  currentCardId === c.id ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:bg-white/5'
                }`}
              >
                <button className="flex-1 truncate text-left" onClick={() => loadCard(c)}>
                  {c.name}
                </button>
                <button className="opacity-60 hover:text-red-400 hover:opacity-100" onClick={() => handleDeleteSaved(c.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
              </div>
            )}
          </div>
        </div>
        {/* center: live preview (drag / resize / rotate / group) */}
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto rounded-lg border border-white/5 bg-neutral-950/40 p-4">
          <PreviewPane
            host={footshortsHost}
            state={composer}
            ctx={ctx}
            captureRef={captureRef}
            selection={selection}
            multiSel={multiSel}
            onSelect={setSelection}
            onToggleMulti={onToggleMulti}
            onChange={onChange}
          />
        </div>
      </div>
    </div>
  )
}
