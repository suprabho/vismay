'use client'

/**
 * Section-scoped image-layer editor. Combines an asset picker (browse + upload)
 * with the inline metadata fields from the image module's `adminForm()`:
 *   - src (assets://… picked from the grid below)
 *   - alt
 *   - fit (cover / contain / fill / scale-down / none)
 *   - focus (object-position)
 *   - background (loading / letterbox fill)
 *
 * Mounted as a portal so the modal escapes Rete's stacking context — same
 * reason MapPickerModal portals to <body>.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AssetListEntry } from '@/app/api/vizmaya/stories/[slug]/assets/route'
import PromptBar from './PromptBar'

type ImageFit = 'cover' | 'contain' | 'fill' | 'scale-down' | 'none'

export interface ImageLayerDraft {
  src: string
  alt?: string
  fit?: ImageFit
  focus?: string
  background?: string
}

interface Props {
  slug: string
  sectionLabel: string
  initial: ImageLayerDraft
  onApply: (next: ImageLayerDraft) => void
  onClose: () => void
}

const FIT_OPTIONS: { value: ImageFit; label: string }[] = [
  { value: 'cover', label: 'Cover (fill, crop overflow)' },
  { value: 'contain', label: 'Contain (fit inside, letterbox)' },
  { value: 'fill', label: 'Fill (stretch)' },
  { value: 'scale-down', label: 'Scale down' },
  { value: 'none', label: 'None (intrinsic size)' },
]

function isImageEntry(a: AssetListEntry): boolean {
  if (a.contentType?.startsWith('image/')) return true
  return /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(a.filename)
}

export default function ImageEditModal({
  slug,
  sectionLabel,
  initial,
  onApply,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<ImageLayerDraft>(initial)
  const [assets, setAssets] = useState<AssetListEntry[]>([])
  // Loading starts true so the initial render shows the spinner without a
  // synchronous setLoadingAssets(true) inside the effect — the lint rule
  // `react-hooks/set-state-in-effect` flags sync setState calls in effects.
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** Pure async fetch — only flips loading/error AFTER the await, never
   *  synchronously at the start. The effect below uses this to load on
   *  mount; the upload flow calls it directly to re-list after a POST. */
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(
        `/api/vizmaya/stories/${encodeURIComponent(slug)}/assets`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? `Failed to list assets (HTTP ${res.status})`)
        setLoadingAssets(false)
        return
      }
      const body = (await res.json()) as { assets: AssetListEntry[] }
      setAssets(body.assets.filter(isImageEntry))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to list assets')
    } finally {
      setLoadingAssets(false)
    }
  }, [slug])

  // Load assets once when the modal mounts. `refresh` only sets state after
  // an await (post-fetch resolution), but the lint rule conservatively flags
  // any call to a setState-containing function from inside an effect. The
  // call here is the standard "subscribe to an external system on mount"
  // pattern the docs explicitly allow, so we suppress the rule.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  // Lock body scroll while open — same convention as MapPickerModal.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Esc closes. Catch on the modal root so it doesn't fight Rete's listeners.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  async function upload(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true)
    setError(null)
    try {
      let lastAssetRef: string | null = null
      for (const file of list) {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch(
          `/api/vizmaya/stories/${encodeURIComponent(slug)}/assets`,
          { method: 'POST', body: form }
        )
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error ?? `Upload of "${file.name}" failed (HTTP ${res.status})`)
          break
        }
        // Predict the ref the API generated so we can auto-select it after
        // refresh — matches buildAssetRef's `assets://<slug>/<filename>` shape
        // used by the listing endpoint.
        lastAssetRef = `assets://${slug}/${file.name}`
      }
      await refresh()
      if (lastAssetRef) {
        setDraft((d) => ({ ...d, src: lastAssetRef! }))
      }
    } finally {
      setUploading(false)
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (picked.length > 0) void upload(picked)
  }

  const canApply = draft.src.trim().length > 0
  const apply = () => {
    if (!canApply) return
    // Drop empty optional fields so we don't pollute the YAML with `alt:` /
    // `focus:` keys the author left blank. The image module's defaults take
    // over for missing keys.
    const out: ImageLayerDraft = { src: draft.src.trim() }
    if (draft.alt?.trim()) out.alt = draft.alt.trim()
    if (draft.fit && draft.fit !== 'cover') out.fit = draft.fit
    if (draft.focus?.trim()) out.focus = draft.focus.trim()
    if (draft.background?.trim()) out.background = draft.background.trim()
    onApply(out)
  }

  const selectedAsset = assets.find((a) => a.assetRef === draft.src)

  const modal = (
    <div
      onKeyDown={onKeyDown}
      tabIndex={-1}
      className="fixed inset-0 z-[100] bg-neutral-950 flex flex-col"
    >
      <header
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 pt-[max(env(safe-area-inset-top),0.75rem)]"
      >
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center"
          aria-label="Close"
        >
          ×
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-neutral-500">Image</div>
          <div className="text-sm truncate">{sectionLabel}</div>
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={!canApply}
          className="bg-white text-neutral-950 rounded-lg px-4 py-2 text-sm font-medium active:bg-neutral-200 disabled:opacity-40 disabled:pointer-events-none"
        >
          Apply
        </button>
      </header>

      {error && (
        <div className="px-4 py-2 text-xs text-red-400 border-b border-white/10 bg-red-950/30">
          {error}
        </div>
      )}

      {/* Two-column layout: form (left) + asset grid (right). Stacks on
          narrow viewports so the modal stays usable on tablet widths. */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[360px_1fr] overflow-hidden">
        {/* Left: form */}
        <div className="border-b md:border-b-0 md:border-r border-white/10 overflow-y-auto p-4 space-y-4 bg-neutral-950">
          <PreviewBox asset={selectedAsset} fit={draft.fit ?? 'cover'} focus={draft.focus} />

          {/* AI image generation — uploads to story-assets and selects the
              result as the layer source. Refresh so it appears in the grid. */}
          <PromptBar
            slug={slug}
            kind="layer"
            layerType="image"
            onApplyImage={(result) => {
              setDraft((d) => ({ ...d, src: result.assetRef }))
              void refresh()
            }}
          />

          <Field label="Image source" hint="assets://… or absolute URL">
            <input
              type="text"
              value={draft.src}
              onChange={(e) => setDraft((d) => ({ ...d, src: e.target.value }))}
              placeholder="assets://slug/photo.jpg"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full bg-black/30 rounded px-2 py-1.5 font-mono text-[12px] border border-white/10 focus:outline-none focus:border-white/30"
            />
          </Field>

          <Field label="Alt text">
            <input
              type="text"
              value={draft.alt ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, alt: e.target.value }))}
              placeholder="Describe the image…"
              className="w-full bg-black/30 rounded px-2 py-1.5 text-sm border border-white/10 focus:outline-none focus:border-white/30"
            />
          </Field>

          <Field label="Fit">
            <select
              value={draft.fit ?? 'cover'}
              onChange={(e) =>
                setDraft((d) => ({ ...d, fit: e.target.value as ImageFit }))
              }
              className="w-full bg-black/30 rounded px-2 py-1.5 text-sm border border-white/10 focus:outline-none focus:border-white/30"
            >
              {FIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Focus (CSS object-position)">
            <input
              type="text"
              value={draft.focus ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, focus: e.target.value }))}
              placeholder="center / top / 30% 50%"
              className="w-full bg-black/30 rounded px-2 py-1.5 text-sm border border-white/10 focus:outline-none focus:border-white/30"
            />
          </Field>

          <Field label="Background color">
            <input
              type="text"
              value={draft.background ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, background: e.target.value }))
              }
              placeholder="#000 or transparent"
              className="w-full bg-black/30 rounded px-2 py-1.5 text-sm border border-white/10 focus:outline-none focus:border-white/30"
            />
          </Field>
        </div>

        {/* Right: asset grid */}
        <div className="overflow-y-auto p-4 bg-neutral-950">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs uppercase tracking-wider text-neutral-400">
              Assets {assets.length > 0 && <span className="text-neutral-600 normal-case tracking-normal">· {assets.length}</span>}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-2 py-1 rounded text-neutral-300 hover:text-white border border-white/10 hover:bg-white/5 disabled:opacity-40"
              >
                {uploading ? 'Uploading…' : '↑ Upload'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={onPick}
              />
            </div>
          </div>

          {loadingAssets ? (
            <div className="text-sm text-neutral-500 p-6 text-center">Loading…</div>
          ) : assets.length === 0 ? (
            <div className="text-sm text-neutral-500 p-6 text-center">
              No images yet. Upload one to use it here.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {assets.map((a) => {
                const selected = a.assetRef === draft.src
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({ ...d, src: a.assetRef }))
                    }
                    className={`text-left rounded-lg overflow-hidden border bg-neutral-900/50 transition-colors ${
                      selected
                        ? 'border-white/60 ring-2 ring-white/40'
                        : 'border-white/5 hover:border-white/20'
                    }`}
                    title={a.filename}
                  >
                    <div className="aspect-square bg-neutral-950 flex items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.url}
                        alt={a.filename}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div className="px-2 py-1.5">
                      <div className="text-[11px] text-white truncate" title={a.filename}>
                        {a.filename}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-neutral-400">{label}</span>
        {hint && <span className="text-[10px] text-neutral-600">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

function PreviewBox({
  asset,
  fit,
  focus,
}: {
  asset: AssetListEntry | undefined
  fit: ImageFit
  focus?: string
}) {
  return (
    <div className="aspect-video rounded-lg border border-white/10 bg-neutral-900 overflow-hidden flex items-center justify-center">
      {asset ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.url}
          alt={asset.filename}
          className="w-full h-full"
          style={{
            objectFit: fit,
            objectPosition: focus?.trim() || 'center',
          }}
        />
      ) : (
        <span className="text-xs text-neutral-500">no image selected</span>
      )}
    </div>
  )
}
