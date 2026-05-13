'use client'

/**
 * Autoplay map override editor.
 *
 * Layout:
 *   - Top bar: aspect toggle (9:16 / 16:9), "Open in new tab", override
 *     count, Save button.
 *   - Left pane: YAML textarea with sample-comment placeholder.
 *   - Right pane: iframe loading the live story in autoplay mode at the
 *     selected aspect, framed with `aspect-ratio` CSS so what you see is
 *     what the video render will see. Reloads on save.
 *
 * The override applies ONLY in autoplay (`?autoplay=1`) — scrollytelling
 * readers see the unmodified config.yaml. See lib/storyMapOverrides.ts.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { parseMapOverrides } from '@/lib/storyMapOverrides'
import { useTabIndent } from '@/lib/useTabIndent'

type Aspect = '9:16' | '16:9'

interface Props {
  slug: string
  initialYaml: string | null
}

const PLACEHOLDER = `# Autoplay map overrides — applied ONLY when the story plays in
# autoplay mode (the muted, video-shaped playback at /story/<slug>?autoplay=1
# and the rendered MP4 at /api/story-video/<slug>?aspect=9:16|16:9).
# Scrollytelling readers see the unmodified <slug>.config.yaml.
#
# Identity: { parentIndex, subIndex? }. Omit subIndex to override the
# parent section's map block; include it to override one subsection.
# Field-level merge — only the keys you set are touched. pins / regions /
# heatmap REPLACE (do not merge) so you can fully redraw a step.
#
# overrides:
#   # Tighter zoom on section 0's map for autoplay only
#   - target: { parentIndex: 0 }
#     map:
#       center: [-95.0, 40.0]
#       zoom: 4
#       pitch: 30
#       bearing: 0
#       flySpeed: 1.4
#       opacity: 0.85
#       pins:
#         - coordinates: [-95.0, 40.0]
#           label: "Mid-continent"
#           color: "#D85A30"
#           radius: 14
#           pulse: true
#           labelAnchor: top
#       # Portrait-only (9:16) sub-layer — applied on top of the desktop
#       # values when the autoplay render is vertical. Useful for cropping
#       # tighter or moving the focal point lower so it clears the bottom
#       # text card area.
#       mobile:
#         center: [-95.0, 38.0]
#         zoom: 3.4
#
#   # Override one subsection step — same shape, with subIndex set
#   - target: { parentIndex: 0, subIndex: 1 }
#     map:
#       zoom: 6
`

export default function MapEditor({ slug, initialYaml }: Props) {
  const [draft, setDraft] = useState<string>(initialYaml ?? '')
  const [savedYaml, setSavedYaml] = useState<string>(initialYaml ?? '')
  const [aspect, setAspect] = useState<Aspect>('9:16')
  const [saving, setSaving] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [status, setStatus] = useState<{
    type: 'idle' | 'ok' | 'err'
    msg?: string
  }>({ type: 'idle' })
  const onTabKey = useTabIndent()

  const dirty = draft !== savedYaml

  const overrideCount = useMemo(() => {
    const parsed = parseMapOverrides(draft)
    return parsed?.overrides.length ?? 0
  }, [draft])

  // Show parse errors inline so the editor catches typos immediately —
  // saving still works (the API stores opaque YAML; the renderer falls
  // through to the base config when parse fails) but the user usually
  // wants to fix it first.
  const parseError = useMemo(() => {
    if (!draft.trim()) return null
    const parsed = parseMapOverrides(draft)
    if (parsed === null) return 'YAML failed to parse'
    return null
  }, [draft])

  // Warn before navigating away with unsaved work.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setStatus({ type: 'idle' })
    try {
      const res = await fetch(`/api/admin/stories/${slug}/map`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: draft }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setSavedYaml(draft)
      setStatus({ type: 'ok', msg: 'Saved' })
      // Reload the iframe so the saved overrides flow through. The story
      // page is `revalidate: 60` so the iframe needs a key bump (cache
      // busted by the inner request) — the new render reads the fresh
      // map_yaml column on the server.
      setIframeKey((k) => k + 1)
    } catch (err) {
      setStatus({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Save failed',
      })
    } finally {
      setSaving(false)
    }
  }, [draft, slug])

  // Cmd/Ctrl+S to save — same affordance as the main editor's Config tab.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty && !saving) void handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dirty, saving, handleSave])

  // Autoplay URLs match the AutoplayShell's iframe sources so what's
  // previewed here is exactly what the muted video render will see.
  // 9:16 uses `compose=vertical` which has the inner page self-frame to
  // a 9:16 viewport via VerticalCaptureFrame.
  const previewSrc =
    aspect === '9:16'
      ? `/story/${slug}?autoplay=1&compose=vertical`
      : `/story/${slug}?autoplay=1`

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 bg-neutral-900/40 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Autoplay map overrides</div>
          <div className="text-xs text-neutral-500">
            {overrideCount > 0
              ? `${overrideCount} override${overrideCount === 1 ? '' : 's'} · applies in ?autoplay=1 only`
              : 'No overrides · autoplay falls through to config.yaml'}
          </div>
        </div>
        <AspectToggle value={aspect} onChange={setAspect} />
        <a
          href={previewSrc}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-400 hover:text-white shrink-0"
          title="Open the autoplay preview in a new tab"
        >
          open ↗
        </a>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="text-sm px-3 py-1.5 rounded-md bg-white text-neutral-950 disabled:opacity-40 active:bg-neutral-200"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {(status.type !== 'idle' || parseError) && (
        <div
          className={`px-4 py-2 text-xs border-b border-white/5 shrink-0 ${
            status.type === 'err' || parseError
              ? 'text-red-300 bg-red-950/20'
              : status.type === 'ok'
                ? 'text-emerald-300 bg-emerald-950/20'
                : 'text-neutral-300 bg-neutral-900/40'
          }`}
        >
          {parseError ?? status.msg}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 [@media(min-aspect-ratio:1/1)]:grid-cols-2 min-h-0">
        <div className="flex flex-col min-h-0 border-r border-white/5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onTabKey}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="flex-1 min-h-0 w-full bg-neutral-950 text-neutral-100 placeholder:text-neutral-600 font-mono text-[13px] leading-relaxed p-4 resize-none outline-none focus:bg-neutral-900/40"
          />
        </div>

        <div className="flex flex-col min-h-0 bg-neutral-950">
          <div className="flex-1 min-h-0 flex items-center justify-center p-3 overflow-hidden">
            {/*
              Frame the iframe in the chosen aspect ratio so the editor shows
              the actual visible region the autoplay render will capture. Cap
              by the smaller of width / height so neither orientation pushes
              the iframe past the panel bounds.
            */}
            <div
              className="bg-neutral-900 border border-white/5 rounded overflow-hidden"
              style={{
                aspectRatio: aspect === '9:16' ? '9 / 16' : '16 / 9',
                ...(aspect === '9:16'
                  ? { height: '100%', maxWidth: '100%' }
                  : { width: '100%', maxHeight: '100%' }),
              }}
            >
              <iframe
                key={`${iframeKey}-${aspect}`}
                src={previewSrc}
                className="w-full h-full border-0 block"
                title={`Autoplay preview · ${aspect}`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AspectToggle({
  value,
  onChange,
}: {
  value: Aspect
  onChange: (v: Aspect) => void
}) {
  return (
    <div className="flex rounded-md border border-white/10 overflow-hidden text-xs shrink-0">
      {(['9:16', '16:9'] as const).map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(a)}
          className={`px-2 py-1 ${
            value === a
              ? 'bg-white/10 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
          aria-pressed={value === a}
        >
          {a}
        </button>
      ))}
    </div>
  )
}
