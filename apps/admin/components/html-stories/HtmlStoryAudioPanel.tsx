'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowClockwise, Headphones, Scroll, Warning, Waveform } from '@phosphor-icons/react'
import type { HtmlStoryApp } from '@vismay/html-stories/apps'
import type { HtmlStoryAudio } from '@vismay/html-stories/audio'

/**
 * A published story's section audio (packages/html-stories/src/audio.ts):
 * whether the live page offers the "Listen" player, each section's clip, and
 * the buttons that make it (render-html-story-audio.yml): Generate audio
 * voices the sections that changed, Regenerate all re-voices every one.
 * Publishing never queues it; this is the only trigger. Polls while a run is
 * pending.
 *
 * Script opens the narration script: per section, what the voice says
 * instead of the on-screen text (blank reads the page). It is saved on its
 * own (/api/html-stories/[slug]/audio/script) and heard once the audio is
 * generated again.
 */

interface ScriptSection {
  index: number
  label: string
  pageText: string
  script: string
  writtenFor: string | null
}

interface ScriptView {
  sections: ScriptSection[]
  orphans: { index: number; label: string; text: string }[]
}
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
  const [scriptCurrent, setScriptCurrent] = useState(true)
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
      setScriptCurrent(body.scriptCurrent !== false)
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

  // The narration script, loaded when the editor first opens.
  const [script, setScript] = useState<ScriptView | null>(null)
  const [draft, setDraft] = useState<Record<number, string>>({})
  const [scriptOpen, setScriptOpen] = useState(false)
  const [scriptBusy, setScriptBusy] = useState(false)
  const [scriptMessage, setScriptMessage] = useState<string | null>(null)

  const applyScript = useCallback((view: ScriptView) => {
    setScript(view)
    setDraft(Object.fromEntries(view.sections.map((s) => [s.index, s.script])))
  }, [])

  const loadScript = useCallback(async () => {
    try {
      const res = await fetch(`/api/html-stories/${slug}/audio/script?app=${encodeURIComponent(app)}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'load failed')
      applyScript(body)
    } catch (e) {
      setScriptMessage(e instanceof Error ? e.message : 'load failed')
    }
  }, [slug, app, applyScript])

  const scriptDirty = !!script && script.sections.some((s) => (draft[s.index] ?? '').trim() !== s.script.trim())
  const dirtyRef = useRef(false)
  useEffect(() => {
    dirtyRef.current = scriptDirty
  }, [scriptDirty])

  // Re-read with the page (its sections change when the story is saved), but
  // never over unsaved lines.
  useEffect(() => {
    if (scriptOpen && !dirtyRef.current) loadScript()
  }, [scriptOpen, loadScript, refreshKey])

  const scriptedCount = script ? script.sections.filter((s) => (draft[s.index] ?? '').trim()).length : 0

  async function saveScript(): Promise<boolean> {
    if (!script) return true
    setScriptBusy(true)
    setScriptMessage(null)
    try {
      const res = await fetch(`/api/html-stories/${slug}/audio/script`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          app,
          sections: script.sections.map((s) => ({ index: s.index, label: s.label, text: draft[s.index] ?? '' })),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'save failed')
      applyScript(body)
      setScriptMessage('Script saved. Generate audio to hear it.')
      await load()
      return true
    } catch (e) {
      setScriptMessage(e instanceof Error ? e.message : 'save failed')
      return false
    } finally {
      setScriptBusy(false)
    }
  }

  async function generate(force: boolean) {
    // Voice what's in the editor, not what was saved before it.
    if (scriptDirty && !(await saveScript())) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/html-stories/${slug}/audio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app, force }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'generate failed')
      if (body.ok) setMessage('Queued. Clips appear here as the run finishes, usually within a few minutes.')
      else
        setMessage(
          body.mode === 'unconfigured'
            ? `Dispatch isn't configured here: run \`pnpm --filter @vismay/html-stories generate-audio ${slug}${force ? ' --force' : ''}\`.`
            : body.reason,
        )
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'generate failed')
    } finally {
      setBusy(false)
    }
  }

  const voiced = audio?.sections.filter((s) => s.url) ?? []
  const minutes = audio ? Math.max(1, Math.round(audio.durationMs / 60000)) : 0
  let summary: string
  if (!loaded) summary = 'Loading…'
  else if (!audio) summary = 'No audio yet. Generate it when the story is ready to be heard.'
  else if (running) summary = audio.status === 'pending' ? 'Queued…' : 'Voicing sections…'
  else if (!voiced.length) summary = 'No section was voiced.'
  else
    summary = `${voiced.length} of ${audio.sections.length} sections voiced · ${minutes} min${
      !current
        ? ' · made from an older version, so the page has no player until you generate it again'
        : !scriptCurrent
          ? ' · live on the page, but the script changed since: generate again to hear it'
          : ' · live on the page'
    }`
  const upToDate = current && scriptCurrent

  return (
    <div className="mt-8">
      <h2 className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">Section audio</h2>
      <div className="border border-white/5 rounded-lg px-3 py-2.5 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex gap-2">
            <Headphones size={16} className={upToDate && !running ? 'text-emerald-400 shrink-0' : 'text-neutral-500 shrink-0'} />
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
          <div className="shrink-0 flex items-center gap-3">
            <button
              onClick={() => setScriptOpen(!scriptOpen)}
              title="Write what the voice says for each section, instead of the text on screen"
              className={`inline-flex items-center gap-1 hover:text-white ${scriptOpen ? 'text-white' : 'text-neutral-400'}`}
            >
              <Scroll size={14} /> Script
            </button>
            {(!upToDate || scriptDirty) && (
              <button
                onClick={() => generate(false)}
                disabled={busy || running}
                className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-neutral-200 hover:bg-white/15 hover:text-white disabled:opacity-50"
              >
                <Waveform size={14} /> Generate audio
              </button>
            )}
            {audio && (
              <button
                onClick={() => generate(true)}
                disabled={busy || running}
                title="Re-voice every section, even unchanged ones"
                className="inline-flex items-center gap-1 text-neutral-400 hover:text-white disabled:opacity-50"
              >
                <ArrowClockwise size={14} /> Regenerate all
              </button>
            )}
          </div>
        </div>
        {message && <p className="text-neutral-400 mt-2">{message}</p>}
        {scriptOpen && (
          <div className="mt-3 border-t border-white/5 pt-3">
            <p className="text-neutral-500">
              Write what the voice says for each section. A blank section reads its on-screen text (shown greyed out).
              Paragraph breaks become pauses.
            </p>
            {!script ? (
              <p className="text-neutral-500 mt-2">{scriptMessage ?? 'Loading…'}</p>
            ) : script.sections.length === 0 ? (
              <p className="text-neutral-500 mt-2">
                This page has no sections to narrate ([data-unit], [data-step] or &lt;section&gt; elements).
              </p>
            ) : (
              <>
                <ol className="mt-3 space-y-3">
                  {script.sections.map((s) => {
                    const value = draft[s.index] ?? ''
                    return (
                      <li key={s.index}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-5 shrink-0 text-right text-neutral-600">{s.index + 1}</span>
                          <span className="truncate flex-1 text-neutral-300">{s.label}</span>
                          {value.trim() ? (
                            <button
                              onClick={() => setDraft({ ...draft, [s.index]: '' })}
                              className="text-neutral-500 hover:text-white"
                              title="Clear the line, so the section reads its on-screen text"
                            >
                              Use page text
                            </button>
                          ) : (
                            s.pageText && (
                              <button
                                onClick={() => setDraft({ ...draft, [s.index]: s.pageText })}
                                className="text-neutral-500 hover:text-white"
                                title="Start from the on-screen text and edit it"
                              >
                                Edit page text
                              </button>
                            )
                          )}
                        </div>
                        {s.writtenFor && (
                          <div className="ml-7 mb-1 flex items-center gap-1 text-amber-400">
                            <Warning size={12} /> Written for “{s.writtenFor}”: the page changed since, so check it still fits.
                          </div>
                        )}
                        <textarea
                          value={value}
                          onChange={(e) => setDraft({ ...draft, [s.index]: e.target.value })}
                          placeholder={s.pageText || 'Silent on the page. Write a line to voice it.'}
                          rows={Math.min(8, Math.max(2, Math.ceil((value || s.pageText).length / 90)))}
                          className="ml-7 w-[calc(100%-1.75rem)] rounded border border-white/10 bg-black/30 px-2 py-1.5 text-neutral-200 placeholder:text-neutral-600 focus:border-white/25 focus:outline-none"
                        />
                      </li>
                    )
                  })}
                </ol>
                {script.orphans.length > 0 && (
                  <p className="mt-2 flex items-center gap-1 text-amber-400">
                    <Warning size={12} /> {script.orphans.length} line{script.orphans.length === 1 ? ' is' : 's are'} for
                    sections the page no longer has; saving drops {script.orphans.length === 1 ? 'it' : 'them'}.
                  </p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={saveScript}
                    disabled={scriptBusy || !scriptDirty}
                    className="rounded bg-white/10 px-2 py-1 text-neutral-200 hover:bg-white/15 hover:text-white disabled:opacity-50"
                  >
                    {scriptBusy ? 'Saving…' : 'Save script'}
                  </button>
                  {scriptDirty && (
                    <button onClick={() => applyScript(script)} className="text-neutral-500 hover:text-white">
                      Discard changes
                    </button>
                  )}
                  <span className="text-neutral-600">
                    {scriptedCount} of {script.sections.length} sections scripted
                  </span>
                </div>
                {scriptMessage && <p className="text-neutral-400 mt-2">{scriptMessage}</p>}
              </>
            )}
          </div>
        )}
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
