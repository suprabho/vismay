'use client'

/**
 * Prompt-to-image panel for the AssetsPanel. Sends the prompt + aspect ratio
 * to /api/vizmaya/stories/<slug>/assets/generate, which routes through
 * @vismay/ai-gateway → Vercel AI Gateway → Gemini image model, uploads the
 * bytes to the same story-assets bucket as manual uploads, and returns the
 * newly-created AssetListEntry. The parent appends it to the grid.
 *
 * The prompt persists across successful generations so authors can iterate
 * (tweak adjective → regenerate) without retyping. The bytes themselves are
 * permanent under the bucket; "regenerate" creates a new asset each time
 * rather than overwriting — easier to compare and roll back than mutating
 * in place.
 *
 * Open/closed state is lifted to the parent so the trigger button can live in
 * the AssetsPanel toolbar while this panel renders in its own row below.
 */

import { useState } from 'react'
import type { AssetListEntry } from '@/app/api/vizmaya/stories/[slug]/assets/route'

const ASPECT_RATIOS = [
  { value: '1:1', label: 'Square' },
  { value: '16:9', label: 'Landscape' },
  { value: '9:16', label: 'Portrait' },
  { value: '4:3', label: 'Wide' },
  { value: '3:4', label: 'Tall' },
] as const

type AspectRatio = (typeof ASPECT_RATIOS)[number]['value']

interface Props {
  slug: string
  onClose: () => void
  onGenerated: (asset: AssetListEntry) => void
}

export default function GenerateImagePanel({ slug, onClose, onGenerated }: Props) {
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState<AspectRatio>('1:1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastModel, setLastModel] = useState<string | null>(null)

  async function handleGenerate() {
    const trimmed = prompt.trim()
    if (!trimmed) {
      setError('Prompt is empty.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/vizmaya/stories/${slug}/assets/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed, aspectRatio: aspect }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        asset?: AssetListEntry
        generation?: { model?: string; auditWarning?: string | null }
        error?: string
      }
      if (!res.ok || !body.asset) {
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      onGenerated(body.asset)
      setLastModel(body.generation?.model ?? null)
      if (body.generation?.auditWarning) {
        setError(`Saved, but audit log failed: ${body.generation.auditWarning}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-white/5 bg-neutral-950/60 shrink-0">
      <div className="px-3 py-2.5 flex items-center gap-2">
        <span className="text-xs text-neutral-400">✨ Generate image</span>
        <span className="text-[10px] text-neutral-600">
          imagen-4 · saved as a regular asset
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[11px] text-neutral-500 hover:text-white px-1"
          aria-label="Close generate panel"
        >
          ×
        </button>
      </div>
      <div className="px-3 pb-3 space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="A wide isometric illustration of OPEC oil tankers in the Strait of Hormuz, muted ochre + teal palette, paper-grain texture."
          className="w-full bg-neutral-950 text-neutral-100 text-[12px] leading-relaxed p-2 rounded border border-white/10 resize-vertical focus:outline-none focus:border-white/30 disabled:opacity-40"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-[11px] text-neutral-500">
            <span>Aspect</span>
            {ASPECT_RATIOS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setAspect(r.value)}
                disabled={busy}
                className={
                  'px-2 py-0.5 rounded border text-[11px] ' +
                  (aspect === r.value
                    ? 'border-white/40 text-white bg-white/5'
                    : 'border-white/10 text-neutral-400 hover:text-white hover:bg-white/5') +
                  ' disabled:opacity-40'
                }
                title={r.label}
              >
                {r.value}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || !prompt.trim()}
            className="ml-auto text-xs px-3 py-1.5 rounded bg-white text-neutral-950 disabled:opacity-40"
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {error && <div className="text-[11px] text-red-400">{error}</div>}
        {!error && lastModel && (
          <div className="text-[10px] text-emerald-300/70">
            Last generation served by {lastModel}. Prompt kept — tweak and regenerate.
          </div>
        )}
      </div>
    </div>
  )
}
