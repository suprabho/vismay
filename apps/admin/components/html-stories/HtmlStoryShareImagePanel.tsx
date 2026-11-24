'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowClockwise, ImageSquare } from '@phosphor-icons/react'
import type { HtmlStoryApp } from '@vismay/html-stories/apps'

/** How long to keep polling for a new card after a dispatch. */
const POLL_FOR_MS = 5 * 60_000

/**
 * A published story's generated link-preview card
 * (packages/html-stories/src/shareImage.ts): the screenshot of the page
 * beside its title and description that /s/<slug> serves as og:image.
 * Publishing queues it; **Regenerate** renders it again anyway (a change the
 * page picks up from outside, like a font or the aura scene). Polls for the
 * new card for a few minutes after either.
 */
export function HtmlStoryShareImagePanel({
  slug,
  app,
  refreshKey,
}: {
  slug: string
  app: HtmlStoryApp
  /** Changes when the story is saved or published, to re-read the card. */
  refreshKey: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [waitingSince, setWaitingSince] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const urlAtDispatch = useRef<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/html-stories/${slug}/share-image?app=${encodeURIComponent(app)}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'load failed')
      setUrl(body.shareImageUrl)
      return body.shareImageUrl as string | null
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'load failed')
      return null
    } finally {
      setLoaded(true)
    }
  }, [slug, app])

  // A save or publish may have queued a new card: watch for it.
  useEffect(() => {
    load().then((u) => {
      urlAtDispatch.current = u
    })
    setWaitingSince(Date.now())
  }, [load, refreshKey])

  useEffect(() => {
    if (waitingSince == null) return
    const t = setInterval(async () => {
      const u = await load()
      if ((u && u !== urlAtDispatch.current) || Date.now() - waitingSince > POLL_FOR_MS) setWaitingSince(null)
    }, 10_000)
    return () => clearInterval(t)
  }, [waitingSince, load])

  async function regenerate() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/html-stories/${slug}/share-image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app, force: true }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'regenerate failed')
      if (body.ok) {
        urlAtDispatch.current = url
        setWaitingSince(Date.now())
        setMessage('Queued. The new card shows here when the run finishes, usually within two minutes.')
      } else {
        setMessage(
          body.mode === 'unconfigured'
            ? `Dispatch isn't configured here: run \`pnpm --filter @vismay/html-stories generate-share-image ${slug} --force\`.`
            : body.reason,
        )
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'regenerate failed')
    } finally {
      setBusy(false)
    }
  }

  const summary = !loaded
    ? 'Loading…'
    : url
      ? 'Shown when the story is shared: the page beside its title and description.'
      : "No card yet, so link previews use the page's own og:image. Publishing makes one within a couple of minutes."

  return (
    <div className="mt-8">
      <h2 className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">Share image</h2>
      <div className="border border-white/5 rounded-lg px-3 py-2.5 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex gap-2">
            <ImageSquare size={16} className={url ? 'text-emerald-400 shrink-0' : 'text-neutral-500 shrink-0'} />
            <div className="text-neutral-300">{summary}</div>
          </div>
          <button
            onClick={regenerate}
            disabled={busy}
            title="Render the card again from the live page"
            className="shrink-0 inline-flex items-center gap-1 text-neutral-400 hover:text-white disabled:opacity-50"
          >
            <ArrowClockwise size={14} /> Regenerate
          </button>
        </div>
        {message && <p className="text-neutral-400 mt-2">{message}</p>}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="block mt-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Link-preview card" className="w-full max-w-md aspect-[1200/630] rounded border border-white/10 object-cover" />
          </a>
        )}
      </div>
    </div>
  )
}
