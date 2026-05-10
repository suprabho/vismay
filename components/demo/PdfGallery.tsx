'use client'

import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'

interface CachedPdf {
  public_url: string
  thumbnail_url: string | null
}

interface Props {
  storySlug: string
  report: CachedPdf | null
  slides: CachedPdf | null
}

export default function PdfGallery({ storySlug, report, slides }: Props) {
  return (
    <section
      className="border-t"
      style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="mb-12 max-w-2xl">
          <div
            className="text-xs uppercase tracking-[0.3em] mb-4"
            style={{ color: 'var(--demo-accent)' }}
          >
            Report + slides
          </div>
          <h2
            className="demo-serif text-4xl md:text-5xl leading-[1.05]"
            style={{ color: 'var(--demo-fg)' }}
          >
            For the room.
          </h2>
          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: 'var(--demo-fg-dim)' }}
          >
            A written analysis your reporter can quote from, plus a deck for the
            morning meeting.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <PdfTile label="Report" subLabel="Letter portrait · multi-page" pdf={report} format="report" storySlug={storySlug} aspectRatio="794 / 1123" />
          <PdfTile label="Slides" subLabel="1920×1080 · 16:9 deck" pdf={slides} format="slides" storySlug={storySlug} aspectRatio="16 / 9" />
        </div>
      </div>
    </section>
  )
}

function PdfTile({
  label,
  subLabel,
  pdf,
  format,
  storySlug,
  aspectRatio,
}: {
  label: string
  subLabel: string
  pdf: CachedPdf | null
  format: 'report' | 'slides'
  storySlug: string
  aspectRatio: string
}) {
  const [busy, setBusy] = useState(false)
  const [resolved, setResolved] = useState<CachedPdf | null>(pdf)
  const [error, setError] = useState<string | null>(null)

  async function trigger() {
    setBusy(true)
    setError(null)
    try {
      let attempts = 0
      while (attempts < 30) {
        const res = await fetch(`/api/story-pdf/${storySlug}?format=${format}`)
        const body = await res.json().catch(() => ({}))
        if (res.status === 200 && body.public_url) {
          setResolved({ public_url: body.public_url, thumbnail_url: body.thumbnail_url ?? null })
          return
        }
        if (res.status >= 400 && res.status !== 202) {
          setError(body.error ?? `HTTP ${res.status}`)
          return
        }
        attempts += 1
        await new Promise((r) => setTimeout(r, 4000))
      }
      setError('timed out — try again')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio,
          background: 'var(--demo-bg-2)',
          border: '1px solid var(--demo-fg-line)',
        }}
      >
        {resolved?.thumbnail_url ? (
          <a
            href={resolved.public_url}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-0 group"
          >
            <img
              src={resolved.thumbnail_url}
              alt={`${label} preview`}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div
              className="absolute inset-0 flex items-end justify-end p-4 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'linear-gradient(to top, rgba(20,18,14,0.65), transparent 50%)' }}
            >
              <span
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-[0.2em]"
                style={{ background: 'var(--demo-fg)', color: 'var(--demo-bg)' }}
              >
                Open PDF <ArrowUpRight size={12} strokeWidth={2.5} />
              </span>
            </div>
          </a>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center px-4">
            <div>
              <div
                className="text-[10px] uppercase tracking-[0.25em] mb-3"
                style={{ color: 'var(--demo-fg-mute)' }}
              >
                {busy ? 'Rendering…' : error ? 'Render failed' : 'Not yet rendered'}
              </div>
              {!busy && (
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
              )}
              {error && (
                <p className="mt-3 text-xs" style={{ color: '#E08A6E' }}>
                  {error}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--demo-fg)' }}>
            {label}
          </div>
          <div
            className="text-[10px] uppercase tracking-[0.2em]"
            style={{ color: 'var(--demo-fg-mute)' }}
          >
            {subLabel}
          </div>
        </div>
        {resolved?.public_url && (
          <a
            href={resolved.public_url}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] uppercase tracking-[0.2em]"
            style={{ color: 'var(--demo-fg-mute)' }}
          >
            Open ↗
          </a>
        )}
      </div>
    </div>
  )
}
