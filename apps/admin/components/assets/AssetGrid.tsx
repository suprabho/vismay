'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetListEntry } from '@/app/api/stories/[slug]/assets/route'

/**
 * Shared story-asset picker grid: browse + upload, returning the
 * `assets://<slug>/<file>` ref form (the shape configs store —
 * `resolveAssetUrl` resolves it on every render surface). Extracted from
 * `ImageEditModal`'s right column for the stage editor's add-entity flow;
 * folding `ImageEditModal` itself onto this grid is a follow-up (its preview
 * box also reads the fetched list, so that refactor isn't mechanical).
 */
export default function AssetGrid({
  slug,
  value,
  onPick,
  reloadToken,
}: {
  slug: string
  /** Currently selected assetRef, for the selection ring. */
  value?: string
  onPick: (assetRef: string) => void
  /** Bump to force a re-list (e.g. after an external generate/upload). */
  reloadToken?: number
}) {
  const [assets, setAssets] = useState<AssetListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isImageEntry = (a: AssetListEntry): boolean =>
    a.contentType?.startsWith('image/') || /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(a.filename)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/stories/${encodeURIComponent(slug)}/assets`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? `Failed to list assets (HTTP ${res.status})`)
        return
      }
      const body = (await res.json()) as { assets: AssetListEntry[] }
      setAssets(body.assets.filter(isImageEntry))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to list assets')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-on-mount fetch (same pattern as ImageEditModal)
    void refresh()
  }, [refresh, reloadToken])

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
        const res = await fetch(`/api/stories/${encodeURIComponent(slug)}/assets`, {
          method: 'POST',
          body: form,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error ?? `Upload of "${file.name}" failed (HTTP ${res.status})`)
          break
        }
        lastAssetRef = `assets://${slug}/${file.name}`
      }
      await refresh()
      if (lastAssetRef) onPick(lastAssetRef)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-neutral-400">
          Assets{' '}
          {assets.length > 0 && (
            <span className="normal-case tracking-normal text-neutral-600">· {assets.length}</span>
          )}
        </h3>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="rounded border border-white/10 px-2 py-1 text-xs text-neutral-300 hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          {uploading ? 'Uploading…' : '↑ Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files ? Array.from(e.target.files) : []
            e.target.value = ''
            if (picked.length > 0) void upload(picked)
          }}
        />
      </div>

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      {loading ? (
        <div className="p-6 text-center text-sm text-neutral-500">Loading…</div>
      ) : assets.length === 0 ? (
        <div className="p-6 text-center text-sm text-neutral-500">
          No images yet. Upload one to use it here.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {assets.map((a) => {
            const selected = a.assetRef === value
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => onPick(a.assetRef)}
                className={`overflow-hidden rounded-lg border bg-neutral-900/50 text-left transition-colors ${
                  selected ? 'border-white/60 ring-2 ring-white/40' : 'border-white/5 hover:border-white/20'
                }`}
                title={a.filename}
              >
                <div className="flex aspect-square items-center justify-center overflow-hidden bg-neutral-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.filename} className="h-full w-full object-contain" loading="lazy" />
                </div>
                <div className="truncate px-2 py-1 text-[11px] text-white">{a.filename}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
