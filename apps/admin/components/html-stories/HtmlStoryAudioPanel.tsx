'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowClockwise, Headphones } from '@phosphor-icons/react'
import type { HtmlStoryApp } from '@vismay/html-stories/apps'
import type { HtmlStoryAudio } from '@vismay/html-stories/audio'

/**
 * A published story's section audio (packages/html-stories/src/audio.ts):
 * whether the live page offers the "Listen" player, each section's clip, and
 * Regenerate (every section, through render-html-story-audio.yml). Publishing
 * queues it on its own; this is for checking and redoing. Polls while a run
 * is pending.
 */
export function HtmlStoryAudioPanel({
  slug,
  app,
  refreshKey,
}: {
  slug: string
  app: HtmlStoryApp
  /** Changes when the story is saved or published, to re-read the manifest. */
  refreshKey: string
}) {
  const [audio, setAudio] = useState<HtmlStoryAudio | null>(null)
  const [current, setCurrent] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/html-stories/${slug}/audio?app=${encodeURIComponent(app)}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'load failed')
      setAudio(body.audio)
      setCurrent(body.current)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'load failed')
    } finally {
      setLoaded(true)
    }
  }, [slug, app])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const running = audio?.status === 'pending' || audio?.status === 'generating'
  useEffect(() => {
    if (!running) return
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [running, load])

  async function regenerate() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/html-stories/${slug}/audio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'regenerate failed')
      if (body.ok) setMessage('Queued. Clips appear here as the run finishes, usually within a few minutes.')
      else
        setMessage(
          body.mode === 'unconfigured'
            ? `Dispatch isn't configured here: run \`pnpm --filter @vismay/html-stories generate-audio ${slug} --force\`.`
            : body.reason,
        )
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'regenerate failed')
    } finally {
      setBusy(false)
    }
  }

  const voiced = audio?.sections.filter((s) => s.url) ?? []
  const minutes = audio ? Math.max(1, Math.round(audio.durationMs / 60000)) : 0
  let summary: string
  if (!loaded) summary = 'Loading…'
  else if (!audio) summary = 'No audio yet. It is made when the story is published.'
  else if (running) summary = audio.status === 'pending' ? 'Queued…' : 'Voicing sections…'
  else if (!voiced.length) summary = 'No section was voiced.'
  else
    summary = `${voiced.length} of ${audio.sections.length} sections voiced · ${minutes} min${
      current ? ' · live on the page' : ' · made from an older version, so the page has no player until it is redone'
    }`

  return (
    <div className="mt-8">
      <h2 className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">Section audio</h2>
      <div className="border border-white/5 rounded-lg px-3 py-2.5 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex gap-2">
            <Headphones size={16} className={current && !running ? 'text-emerald-400 shrink-0' : 'text-neutral-500 shrink-0'} />
            <div className="min-w-0">
              <div className="text-neutral-300">{summary}</div>
              {audio?.status === 'failed' && audio.error && <div className="text-red-400 mt-0.5">{audio.error}</div>}
              {audio?.generatedAt && !running && (
                <div className="text-neutral-600 mt-0.5">
                  {new Date(audio.generatedAt).toLocaleString()} · voice {audio.voice ?? 'default'}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={regenerate}
            disabled={busy || running}
            className="shrink-0 inline-flex items-center gap-1 text-neutral-400 hover:text-white disabled:opacity-50"
          >
            <ArrowClockwise size={14} /> Regenerate
          </button>
        </div>
        {message && <p className="text-neutral-400 mt-2">{message}</p>}
        {audio && audio.sections.length > 0 && (
          <>
            <button onClick={() => setOpen(!open)} className="text-neutral-500 hover:text-white mt-2">
              {open ? 'Hide sections' : 'Show sections'}
            </button>
            {open && (
              <ol className="mt-2 space-y-1.5">
                {audio.sections.map((s) => (
                  <li key={s.index} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-right text-neutral-600">{s.index + 1}</span>
                    <span className="truncate flex-1 text-neutral-300">{s.label}</span>
                    {s.url ? (
                      <audio controls preload="none" src={s.url} className="h-7 w-48 shrink-0" />
                    ) : (
                      <span className="text-neutral-600">silent</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  )
}
