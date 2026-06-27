'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  emptyProjectSnapshot,
  LayerComposer,
  type ComposerSelection,
  type ComposerState,
  type VideoProjectAspect,
  type VideoProjectSnapshot,
} from '@vismay/viz-admin'
import { videoHost, type VideoComposerCtx } from './composer/videoHost'
import {
  applyComposerEditsToSnapshot,
  projectToComposerState,
} from './composer/projectToComposerState'
import { TimelinePanel } from './timeline/TimelinePanel'
import { ClipTimingPanel } from './ClipTimingPanel'
import { AssetUploadPanel } from './AssetUploadPanel'

interface SavedVideoProject {
  id: string
  name: string
  aspect: string | null
  config: unknown
  durationMs: number | null
}

const ASPECTS: VideoProjectAspect[] = ['9:16', '16:9']

/**
 * Vizmaya base origin for the cross-app Render button. Admin and vizmaya-fyi are
 * separate apps, so the render endpoint (`/api/video-project/<id>`) lives there.
 * Falls back to '' (same-origin) if NEXT_PUBLIC_VIZMAYA_URL is unset — set that
 * env var in admin to point the button at the right vizmaya-fyi deployment.
 */
const VIZMAYA_BASE = (process.env.NEXT_PUBLIC_VIZMAYA_URL ?? '').replace(/\/$/, '')

/**
 * The freeform video editor. The `VideoProjectSnapshot` is the single source of
 * truth; the composer's `ComposerState` is a pure projection of (snapshot,
 * playheadMs) regenerated via useMemo, and the composer's edits round-trip back
 * through `applyComposerEditsToSnapshot`.
 */
export function VideoEditor({ accessToken }: { accessToken: string }) {
  // accessToken is forwarded to map-bearing clips when they ship; unused today.
  void accessToken

  const [snapshot, setSnapshot] = useState<VideoProjectSnapshot>(() => emptyProjectSnapshot('16:9'))
  const [playheadMs, setPlayheadMs] = useState(0)
  const [selection, setSelection] = useState<ComposerSelection>(null)

  const [projectId, setProjectId] = useState<string | null>(null)
  const [name, setName] = useState('Untitled project')
  const [projects, setProjects] = useState<SavedVideoProject[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const libraryRef = useRef<HTMLDivElement>(null)

  // ── library list ──────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/vizmaya/video/projects')
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; projects?: SavedVideoProject[] }
        if (alive && body.ok) setProjects(body.projects ?? [])
      } catch {
        /* non-fatal */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Close the library dropdown on outside click.
  useEffect(() => {
    if (!libraryOpen) return
    const onDown = (e: PointerEvent) => {
      if (libraryRef.current && !libraryRef.current.contains(e.target as Node)) setLibraryOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [libraryOpen])

  // ── composer projection (single source of truth → derived state) ──────────
  const ctx = useMemo<VideoComposerCtx>(() => ({ aspect: snapshot.aspect }), [snapshot.aspect])
  const composerState = useMemo(
    () => projectToComposerState(snapshot, playheadMs),
    [snapshot, playheadMs],
  )

  // The composer mutates ComposerState (transform / config); fold the edits back
  // into the snapshot at the SAME playhead the projection was taken at.
  const onComposerChange = useCallback(
    (next: ComposerState) => {
      setSnapshot((prev) => applyComposerEditsToSnapshot(prev, next, playheadMs))
    },
    [playheadMs],
  )

  // ── project library actions ───────────────────────────────────────────────
  const loadProject = useCallback((p: SavedVideoProject) => {
    setProjectId(p.id)
    setName(p.name)
    setSelection(null)
    setPlayheadMs(0)
    setError(null)
    try {
      setSnapshot(p.config as VideoProjectSnapshot)
    } catch {
      setError("Couldn't load this project (unexpected format).")
    }
  }, [])

  const newProject = useCallback((aspect: VideoProjectAspect = '16:9') => {
    setProjectId(null)
    setName('Untitled project')
    setSelection(null)
    setPlayheadMs(0)
    setSnapshot(emptyProjectSnapshot(aspect))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: name.trim() || 'Untitled project',
        aspect: snapshot.aspect,
        config: snapshot,
        durationMs: snapshot.durationMs,
      }
      if (projectId) {
        const res = await fetch(`/api/vizmaya/video/projects/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; project?: SavedVideoProject; error?: string }
        if (!res.ok || !body.ok || !body.project) throw new Error(body.error ?? `HTTP ${res.status}`)
        setProjects((prev) => prev.map((p) => (p.id === body.project!.id ? body.project! : p)))
      } else {
        const res = await fetch('/api/vizmaya/video/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; project?: SavedVideoProject; error?: string }
        if (!res.ok || !body.ok || !body.project) throw new Error(body.error ?? `HTTP ${res.status}`)
        setProjectId(body.project.id)
        setProjects((prev) => [body.project!, ...prev])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [name, snapshot, projectId])

  const handleDelete = useCallback(async (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    setProjectId((cur) => (cur === id ? null : cur))
    try {
      await fetch(`/api/vizmaya/video/projects/${id}`, { method: 'DELETE' })
    } catch {
      /* optimistic */
    }
  }, [])

  // Cross-app render: open the vizmaya-fyi render endpoint in a new tab. The
  // endpoint dispatches/streams the MP4; opening it avoids a cross-origin fetch.
  const renderUrl = projectId
    ? `${VIZMAYA_BASE}/api/video-project/${projectId}?aspect=${encodeURIComponent(snapshot.aspect)}`
    : null

  // ── aspect toggle ─────────────────────────────────────────────────────────
  const setAspect = useCallback((aspect: VideoProjectAspect) => {
    setSnapshot((prev) => ({ ...prev, aspect }))
  }, [])

  const selectedClipId = selection?.kind === 'layer' ? selection.id : null

  const labelCls = 'text-[11px] font-medium text-neutral-400'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-neutral-100">Video</h1>

        {/* project library */}
        <div ref={libraryRef} className="relative">
          <button
            onClick={() => setLibraryOpen((o) => !o)}
            className="flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-white/10"
          >
            Projects{projects.length > 0 ? ` · ${projects.length}` : ''}
            <span className="text-neutral-500">▾</span>
          </button>
          {libraryOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-white/10 bg-neutral-900 p-1.5 shadow-xl">
              <button
                onClick={() => {
                  newProject(snapshot.aspect)
                  setLibraryOpen(false)
                }}
                className="mb-1 w-full rounded-md border border-white/10 px-2 py-1.5 text-left text-[11px] text-neutral-100 hover:bg-white/5"
              >
                + New project
              </button>
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded-md border p-1.5 ${
                    projectId === p.id ? 'border-sky-400/50 bg-white/5' : 'border-transparent hover:bg-white/5'
                  }`}
                >
                  <button
                    onClick={() => {
                      loadProject(p)
                      setLibraryOpen(false)
                    }}
                    className="min-w-0 flex-1 truncate text-left text-[11px] text-neutral-200 hover:text-white"
                  >
                    {p.name}
                    <span className="ml-1 text-neutral-500">· {p.aspect ?? '—'}</span>
                  </button>
                  <button
                    onClick={() => void handleDelete(p.id)}
                    className="shrink-0 rounded px-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
                    aria-label="Delete project"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          className="w-48 rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30"
        />

        {/* aspect toggle */}
        <div className="flex rounded-md border border-white/15 p-0.5">
          {ASPECTS.map((a) => (
            <button
              key={a}
              onClick={() => setAspect(a)}
              className={`rounded px-2 py-1 text-[11px] ${
                snapshot.aspect === a ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {error && (
          <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
            {error}
          </span>
        )}

        {renderUrl ? (
          <a
            href={renderUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400"
          >
            Render MP4
          </a>
        ) : (
          <button
            disabled
            title="Save the project first"
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 opacity-40"
          >
            Render MP4
          </button>
        )}
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-md border border-white/15 px-3 py-1.5 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* ── Body: canvas (left) + side panel (right) ──────────────────────── */}
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* spatial canvas */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/40 p-3">
            <LayerComposer
              host={videoHost}
              state={composerState}
              onChange={onComposerChange}
              selection={selection}
              onSelect={setSelection}
              ctx={ctx}
            />
          </div>

          {/* timeline */}
          <TimelinePanel
            snapshot={snapshot}
            playheadMs={playheadMs}
            selection={selection}
            onSeek={setPlayheadMs}
            onSnapshotChange={setSnapshot}
            onSelect={setSelection}
          />
        </div>

        {/* right rail: assets + selected-clip timing */}
        <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto">
          <p className={labelCls}>Playhead · {(playheadMs / 1000).toFixed(2)}s</p>
          <AssetUploadPanel
            projectId={projectId}
            snapshot={snapshot}
            playheadMs={playheadMs}
            onSnapshotChange={setSnapshot}
            onSelectClip={(id) => setSelection({ kind: 'layer', id })}
          />
          <div className="border-t border-white/10 pt-3">
            {selectedClipId ? (
              <ClipTimingPanel
                snapshot={snapshot}
                clipId={selectedClipId}
                onSnapshotChange={setSnapshot}
                onClearSelection={() => setSelection(null)}
              />
            ) : (
              <p className="text-[11px] text-neutral-600">Select a clip on the canvas or timeline.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
