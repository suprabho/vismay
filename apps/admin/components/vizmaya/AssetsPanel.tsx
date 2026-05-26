'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetListEntry } from '@/app/api/vizmaya/stories/[slug]/assets/route'
import ComposeVizPanel from './ComposeVizPanel'
import GenerateImagePanel from './GenerateImagePanel'

interface Props {
  slug: string
  initialAssets: AssetListEntry[]
}

function isImageType(contentType: string | null, filename: string): boolean {
  if (contentType?.startsWith('image/')) return true
  return /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(filename)
}

function isVideoType(contentType: string | null, filename: string): boolean {
  if (contentType?.startsWith('video/')) return true
  return /\.mp4$/i.test(filename)
}

function isRiveType(filename: string): boolean {
  return /\.riv$/i.test(filename)
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function AssetsPanel({ slug, initialAssets }: Props) {
  const [assets, setAssets] = useState<AssetListEntry[]>(initialAssets)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const refresh = useCallback(async () => {
    setError(null)
    const res = await fetch(`/api/vizmaya/stories/${slug}/assets`)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error ?? `Failed to list assets (HTTP ${res.status})`)
      return
    }
    const body = (await res.json()) as { assets: AssetListEntry[] }
    setAssets(body.assets)
  }, [slug])

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return
      setError(null)
      setUploading(true)
      try {
        // Serial uploads — Supabase Storage handles parallel fine, but a serial
        // loop gives the UI deterministic ordering and lets a single rejected
        // file stop the batch with a clear message instead of mixing errors.
        for (const file of list) {
          const form = new FormData()
          form.append('file', file)
          let res: Response
          try {
            res = await fetch(`/api/vizmaya/stories/${slug}/assets`, {
              method: 'POST',
              body: form,
            })
          } catch (err) {
            setError(`Upload of "${file.name}" failed: ${err instanceof Error ? err.message : 'network error'}`)
            break
          }
          if (!res.ok) {
            const body = await res.json().catch(() => null)
            setError(body?.error ?? `Upload of "${file.name}" failed (HTTP ${res.status})`)
            break
          }
        }
      } finally {
        setUploading(false)
      }
      await refresh()
    },
    [slug, refresh]
  )

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Copy the FileList into a plain array BEFORE clearing the input.
    // `input.files` is a live FileList in most browsers — setting `value = ''`
    // empties the same object we just captured, so reading `files.length`
    // afterwards would return 0 and the upload would silently no-op.
    const picked = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (picked.length > 0) void upload(picked)
  }

  // Drag-and-drop wiring. The drop zone covers the whole panel so authors can
  // drop anywhere — the grid below is rendered inside the same container.
  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      setDragging(true)
    }
    const onDragLeave = (e: DragEvent) => {
      if (e.target === el) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        void upload(e.dataTransfer.files)
      }
    }
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [upload])

  async function copyRef(ref: string) {
    try {
      await navigator.clipboard.writeText(ref)
      setCopiedKey(ref)
      setTimeout(() => setCopiedKey((c) => (c === ref ? null : c)), 1500)
    } catch {
      setError('Clipboard write blocked — copy manually.')
    }
  }

  async function deleteAsset(filename: string) {
    if (!confirm(`Delete "${filename}"? This cannot be undone, and any story config or markdown that references it will break until updated.`)) return
    setError(null)
    const res = await fetch(`/api/vizmaya/stories/${slug}/assets/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error ?? `Delete failed (HTTP ${res.status})`)
      return
    }
    setAssets((cur) => cur.filter((a) => a.filename !== filename))
  }

  return (
    <div ref={dropRef} className="flex-1 flex flex-col min-h-0 relative">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/5 bg-neutral-900/40 shrink-0">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="text-xs px-2 py-1 rounded text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-40"
        >
          {uploading ? 'Uploading…' : '↑ Upload'}
        </button>
        <button
          type="button"
          onClick={() => setGenerateOpen((v) => !v)}
          className={
            'text-xs px-2 py-1 rounded hover:text-white hover:bg-white/5 ' +
            (generateOpen ? 'text-white bg-white/5' : 'text-neutral-400')
          }
          title="Generate an image from a text prompt via the AI gateway"
        >
          ✨ Generate
        </button>
        <span className="text-xs text-neutral-500">
          {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
        </span>
        {error && (
          <span className="text-xs text-red-400 ml-2 truncate">{error}</span>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,video/mp4,.riv,application/octet-stream"
          onChange={onPick}
        />
      </div>

      {dragging && (
        <div className="absolute inset-x-0 top-10 bottom-0 z-10 pointer-events-none bg-white/5 border-2 border-dashed border-white/30 flex items-center justify-center">
          <span className="text-sm text-white/70">Drop files to upload</span>
        </div>
      )}

      {generateOpen && (
        <GenerateImagePanel
          slug={slug}
          onClose={() => setGenerateOpen(false)}
          onGenerated={(asset) =>
            // Prepend new generations so the most-recent one is visible at the
            // top of the grid without needing to scroll.
            setAssets((cur) => [asset, ...cur.filter((a) => a.key !== asset.key)])
          }
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {assets.length === 0 ? (
          <div className="flex items-center justify-center text-sm text-neutral-500 p-8 text-center">
            No assets yet. Upload images, .mp4 videos, or .riv files — they&apos;ll be referenced from
            YAML as <code className="text-neutral-300">assets://{slug}/&lt;filename&gt;</code>.
          </div>
        ) : (
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {assets.map((a) => (
              <AssetCard
                key={a.key}
                asset={a}
                onCopy={() => copyRef(a.assetRef)}
                onDelete={() => deleteAsset(a.filename)}
                copied={copiedKey === a.assetRef}
              />
            ))}
          </div>
        )}
        <div className="px-3 pb-6">
          <ComposeVizPanel assetRefs={assets.map((a) => a.assetRef)} />
        </div>
      </div>
    </div>
  )
}

function AssetCard({
  asset,
  onCopy,
  onDelete,
  copied,
}: {
  asset: AssetListEntry
  onCopy: () => void
  onDelete: () => void
  copied: boolean
}) {
  const isImage = isImageType(asset.contentType, asset.filename)
  const isVideo = isVideoType(asset.contentType, asset.filename)
  const isRive = isRiveType(asset.filename)
  return (
    <div className="rounded-lg border border-white/5 bg-neutral-900/40 overflow-hidden flex flex-col">
      <div className="aspect-square bg-neutral-950 flex items-center justify-center overflow-hidden">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.url}
            alt={asset.filename}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : isVideo ? (
          <video
            src={asset.url}
            className="w-full h-full object-contain"
            muted
            preload="metadata"
          />
        ) : (
          <span className="text-xs uppercase tracking-widest text-neutral-500">
            {isRive ? 'Rive' : (asset.contentType ?? 'file')}
          </span>
        )}
      </div>
      <div className="px-2 py-1.5 flex flex-col gap-1">
        <div className="text-xs text-white truncate" title={asset.filename}>
          {asset.filename}
        </div>
        <div className="text-[10px] text-neutral-500 flex items-center gap-2">
          <span>{formatBytes(asset.size)}</span>
          {asset.contentType && <span className="truncate">{asset.contentType}</span>}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <button
            type="button"
            onClick={onCopy}
            className="text-[10px] flex-1 px-1.5 py-1 rounded text-neutral-400 hover:text-white hover:bg-white/5"
            title={asset.assetRef}
          >
            {copied ? '✓ copied' : 'Copy key'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-[10px] px-1.5 py-1 rounded text-neutral-500 hover:text-red-400 hover:bg-white/5"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
