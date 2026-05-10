'use client'

import { useEffect, useState } from 'react'

interface Cached {
  public_url: string
  duration_ms: number | null
}

interface Props {
  clientSlug: string
  storySlug: string
  v916: Cached | null
  v169: Cached | null
}

type Status =
  | { kind: 'idle' }
  | { kind: 'rendering'; aspect: string }
  | { kind: 'ready'; public_url: string }
  | { kind: 'error'; msg: string }

export default function VideoGallery({ storySlug, v916, v169 }: Props) {
  return (
    <section
      className="border-t"
      style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg-2)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="mb-12 max-w-2xl">
          <div
            className="text-xs uppercase tracking-[0.3em] mb-4"
            style={{ color: 'var(--demo-accent)' }}
          >
            Video preview · 20 seconds
          </div>
          <h2
            className="demo-serif text-4xl md:text-5xl leading-[1.05]"
            style={{ color: 'var(--demo-fg)' }}
          >
            Two cuts, ready to ship.
          </h2>
          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: 'var(--demo-fg-dim)' }}
          >
            9:16 for Reels and Shorts. 16:9 for YouTube and the homepage hero.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-end">
          <VideoTile
            label="9:16 · vertical"
            aspect="9:16"
            ratio="9 / 16"
            cached={v916}
            storySlug={storySlug}
            maxWidth={360}
          />
          <VideoTile
            label="16:9 · landscape"
            aspect="16:9"
            ratio="16 / 9"
            cached={v169}
            storySlug={storySlug}
          />
        </div>
      </div>
    </section>
  )
}

function VideoTile({
  label,
  aspect,
  ratio,
  cached,
  storySlug,
  maxWidth,
}: {
  label: string
  aspect: '9:16' | '16:9'
  ratio: string
  cached: Cached | null
  storySlug: string
  maxWidth?: number
}) {
  const [status, setStatus] = useState<Status>(
    cached ? { kind: 'ready', public_url: cached.public_url } : { kind: 'idle' }
  )

  useEffect(() => {
    // No render in flight on mount — sales presses "Render now" if needed.
  }, [])

  async function trigger() {
    setStatus({ kind: 'rendering', aspect })
    try {
      let attempts = 0
      while (attempts < 60) {
        const res = await fetch(
          `/api/story-video/${storySlug}?aspect=${encodeURIComponent(aspect)}&preview=1`
        )
        const body = await res.json().catch(() => ({}))
        if (res.status === 200 && body.public_url) {
          setStatus({ kind: 'ready', public_url: body.public_url })
          return
        }
        if (res.status >= 400 && res.status !== 202) {
          setStatus({ kind: 'error', msg: body.error ?? `HTTP ${res.status}` })
          return
        }
        attempts += 1
        await new Promise((r) => setTimeout(r, 5000))
      }
      setStatus({ kind: 'error', msg: 'timed out — try again' })
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className="flex flex-col gap-3" style={{ maxWidth }}>
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: ratio,
          background: '#000',
          border: '1px solid var(--demo-fg-line)',
        }}
      >
        {status.kind === 'ready' ? (
          <video
            src={status.public_url}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center px-4">
            <div>
              <div
                className="text-[10px] uppercase tracking-[0.25em] mb-3"
                style={{ color: 'var(--demo-fg-mute)' }}
              >
                {status.kind === 'rendering'
                  ? 'Rendering preview…'
                  : status.kind === 'error'
                    ? 'Render failed'
                    : 'Preview not yet rendered'}
              </div>
              {status.kind === 'idle' || status.kind === 'error' ? (
                <button
                  onClick={trigger}
                  className="text-xs uppercase tracking-[0.2em] px-4 py-2"
                  style={{
                    border: '1px solid rgb(var(--demo-fg-rgb) / 0.3)',
                    color: 'var(--demo-fg)',
                  }}
                >
                  Render now
                </button>
              ) : null}
              {status.kind === 'error' && (
                <p className="mt-3 text-xs" style={{ color: '#E08A6E' }}>
                  {status.msg}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-[10px] uppercase tracking-[0.2em]"
          style={{ color: 'var(--demo-fg-mute)' }}
        >
          {label}
        </span>
        {status.kind === 'ready' && (
          <a
            href={status.public_url}
            download
            className="text-[10px] uppercase tracking-[0.2em]"
            style={{ color: 'var(--demo-fg-mute)' }}
          >
            download ↓
          </a>
        )}
      </div>
    </div>
  )
}
