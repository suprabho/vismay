'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  composerUid,
  DEFAULT_ENTER_ANIM,
  DEFAULT_EXIT_ANIM,
  DEFAULT_TRANSFORM,
  type ClipRole,
  type VideoClip,
  type VideoProjectSnapshot,
} from '@vismay/viz-admin'
import { addClipToSnapshot } from './composer/projectToComposerState'

/** Default on-timeline length (ms) for a freshly added asset clip. */
const DEFAULT_CLIP_MS = 3000

interface AssetEntry {
  filename: string
  assetRef: string
  url: string
  contentType: string | null
}

type AssetKind = 'video' | 'audio' | 'image' | 'other'

function kindOf(a: AssetEntry): AssetKind {
  const ct = a.contentType ?? ''
  if (ct.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(a.filename)) return 'video'
  if (ct.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(a.filename)) return 'audio'
  if (ct.startsWith('image/') || /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(a.filename)) return 'image'
  return 'other'
}

/**
 * Asset library for the project: lists + uploads assets via the shared
 * `/api/stories/<projectId>/assets` route (keyed by the project uuid — a uuid
 * passes the route's SAFE_SLUG), and offers "Add as clip" buttons that append a
 * clip to the snapshot. A project must be SAVED first (the route is keyed by id),
 * so the panel guards for that.
 */
export function AssetUploadPanel({
  projectId,
  snapshot,
  playheadMs,
  onSnapshotChange,
  onSelectClip,
}: {
  projectId: string | null
  snapshot: VideoProjectSnapshot
  playheadMs: number
  onSnapshotChange: (next: VideoProjectSnapshot) => void
  onSelectClip: (id: string) => void
}) {
  const [assets, setAssets] = useState<AssetEntry[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await fetch(`/api/stories/${encodeURIComponent(projectId)}/assets`)
      const body = (await res.json().catch(() => ({}))) as { assets?: AssetEntry[] }
      setAssets(body.assets ?? [])
    } catch {
      setAssets([])
    }
  }, [projectId])

  // Load assets when the project id changes. Inline fetch with an `alive` guard
  // (not a `void refresh()` call) keeps the lint rule happy and avoids a stale
  // setState after unmount, mirroring ShareCardCreator's asset effect.
  useEffect(() => {
    // No project yet → the panel renders its "save first" guard, so leave
    // `assets` as-is (it's already empty and the list is hidden).
    if (!projectId) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch(`/api/stories/${encodeURIComponent(projectId)}/assets`)
        const body = (await res.json().catch(() => ({}))) as { assets?: AssetEntry[] }
        if (alive) setAssets(body.assets ?? [])
      } catch {
        if (alive) setAssets([])
      }
    })()
    return () => {
      alive = false
    }
  }, [projectId])

  const onUpload = useCallback(
    async (file: File) => {
      if (!projectId) return
      setUploading(true)
      setError(null)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`/api/stories/${encodeURIComponent(projectId)}/assets`, {
          method: 'POST',
          body: fd,
        })
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [projectId, refresh],
  )

  const findTrack = useCallback(
    (kind: 'visual' | 'audio') => snapshot.tracks.find((t) => t.kind === kind) ?? null,
    [snapshot.tracks],
  )

  // Build a clip for an asset and append it at the current playhead.
  const addAsClip = useCallback(
    (a: AssetEntry) => {
      const k = kindOf(a)
      const visual = findTrack('visual')
      const audio = findTrack('audio')
      let layerType: 'video' | 'image' | 'audio'
      let role: ClipRole
      let trackId: string | undefined
      if (k === 'audio') {
        layerType = 'audio'
        role = 'audio'
        trackId = audio?.id
      } else if (k === 'image') {
        layerType = 'image'
        role = 'object'
        trackId = visual?.id
      } else {
        // video + anything else falls back to a video clip on the visual track.
        layerType = 'video'
        role = 'media'
        trackId = visual?.id
      }
      if (!trackId) {
        setError('No matching track for this asset.')
        return
      }
      const clip: VideoClip = {
        id: composerUid('clip'),
        trackId,
        layer:
          layerType === 'audio'
            ? { type: 'audio', src: a.assetRef }
            : layerType === 'image'
              ? { type: 'image', src: a.assetRef, fit: 'contain' }
              : { type: 'video', src: a.assetRef, muted: true },
        role,
        startMs: Math.round(playheadMs),
        durationMs: DEFAULT_CLIP_MS,
        transform:
          layerType === 'video'
            ? { xPct: 50, yPct: 50, widthPct: 100, heightPct: 100, scale: 1, rotation: 0, opacity: 1 }
            : { ...DEFAULT_TRANSFORM, widthPct: 50, heightPct: 50 },
        enterAnim: { ...DEFAULT_ENTER_ANIM },
        exitAnim: { ...DEFAULT_EXIT_ANIM },
        visible: true,
      }
      onSnapshotChange(addClipToSnapshot(snapshot, clip))
      onSelectClip(clip.id)
    },
    [findTrack, playheadMs, snapshot, onSnapshotChange, onSelectClip],
  )

  if (!projectId) {
    return (
      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
        Save the project first to upload &amp; add assets (asset storage is keyed by project id).
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-neutral-200">Assets</h3>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-neutral-100 hover:bg-white/10 disabled:opacity-40"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onUpload(f)
            e.target.value = ''
          }}
        />
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
          {error}
        </p>
      )}

      {assets.length === 0 ? (
        <p className="text-[11px] text-neutral-600">No assets yet. Upload a video, audio or image.</p>
      ) : (
        <ul className="space-y-1.5">
          {assets.map((a) => (
            <li
              key={a.assetRef}
              className="flex items-center gap-2 rounded-md border border-white/10 bg-neutral-900 p-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-200" title={a.filename}>
                {a.filename}
              </span>
              <span className="shrink-0 rounded bg-white/5 px-1 text-[9px] uppercase text-neutral-500">
                {kindOf(a)}
              </span>
              <button
                onClick={() => addAsClip(a)}
                className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-neutral-100 hover:bg-white/10"
              >
                Add as clip
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
