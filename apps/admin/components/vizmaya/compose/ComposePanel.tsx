'use client'

import { useEffect, useState } from 'react'
// Import the model list from the pure `./models` subpath, NOT the package root:
// the root re-exports the ingest pipeline (jsdom/fs/pdf-parse), which can't be
// bundled into this client component. Types below are erased, so the root is fine.
import { TEXT_MODEL_CHOICES, DEFAULT_TEXT_MODEL } from '@vismay/story-pipeline/models'
import type {
  ResearchBrief,
  ClarifyingQuestion,
  SourceDoc,
  StoryFormat,
  StoryOutline,
  GeneratedSection,
  ImagePrompt,
  ValidationIssue,
  IngestFailure,
} from '@vismay/story-pipeline'

type Phase = 'input' | 'researching' | 'questions' | 'generating' | 'done'

interface ResearchResponse {
  ok: true
  sessionId: string
  sources: SourceDoc[]
  failures: IngestFailure[]
  brief: ResearchBrief
  questions: ClarifyingQuestion[]
}

interface ErrorResponse {
  error: string
  failures?: IngestFailure[]
}

interface DoneInfo {
  slug: string
  previewUrl: string
  format: StoryFormat
  imagePrompts: ImagePrompt[]
  issues: ValidationIssue[]
}

interface SessionSummary {
  id: string
  title: string
  status: 'researched' | 'generating' | 'done' | 'error'
  updatedAt: string
  done: number
  total: number
  format?: StoryFormat
  slug?: string
}

interface LoadedSession {
  id: string
  model: string
  format?: StoryFormat
  answers: Record<string, string>
  sources: SourceDoc[]
  brief: ResearchBrief
  outline?: StoryOutline
  sections: (GeneratedSection | null)[]
  slug?: string
  status: string
}

type GenEvent =
  | { type: 'outline'; outline: StoryOutline }
  | { type: 'section'; index: number; total: number; section: GeneratedSection; cached?: boolean }
  | ({ type: 'done' | 'paused' } & DoneInfo & { outline: StoryOutline; done: number; total: number })
  | { type: 'error'; error: string }

const card = 'rounded-lg border border-white/10 bg-neutral-900/60 p-4'
const label = 'text-xs uppercase tracking-wider text-neutral-500'
const btn =
  'rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed'

export function ComposePanel() {
  const [phase, setPhase] = useState<Phase>('input')
  const [error, setError] = useState<string | null>(null)

  const [links, setLinks] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [model, setModel] = useState<string>(DEFAULT_TEXT_MODEL)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sources, setSources] = useState<SourceDoc[]>([])
  const [failures, setFailures] = useState<IngestFailure[]>([])
  const [brief, setBrief] = useState<ResearchBrief | null>(null)
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [format, setFormat] = useState<StoryFormat>('deck')

  // Step-wise generation state.
  const [outline, setOutline] = useState<StoryOutline | null>(null)
  const [genSections, setGenSections] = useState<GeneratedSection[]>([])
  const [done, setDone] = useState<DoneInfo | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [feedbacks, setFeedbacks] = useState<Record<number, string>>({})
  const [regenIndex, setRegenIndex] = useState<number | null>(null)

  const [pastSessions, setPastSessions] = useState<SessionSummary[]>([])

  const busy = phase === 'researching' || phase === 'generating'

  // Load saved sessions on mount so the editor can resume after a reload.
  useEffect(() => {
    let live = true
    fetch('/api/vizmaya/compose/sessions')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d?.ok) setPastSessions(d.sessions as SessionSummary[])
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  async function runResearch() {
    setError(null)
    setFailures([])
    setPhase('researching')
    try {
      const form = new FormData()
      form.set('links', links)
      form.set('model', model)
      for (const f of files) form.append('files', f)
      const res = await fetch('/api/vizmaya/compose/research', { method: 'POST', body: form })
      const data = (await res.json()) as ResearchResponse | ErrorResponse
      if (!res.ok || !('ok' in data)) {
        const err = data as ErrorResponse
        if (err.failures?.length) setFailures(err.failures)
        throw new Error(err.error ?? 'research failed')
      }
      setSessionId(data.sessionId)
      setSources(data.sources)
      setFailures(data.failures ?? [])
      setBrief(data.brief)
      setQuestions(data.questions)
      setFormat(data.brief.suggestedFormat)
      const seed: Record<string, string> = {}
      for (const q of data.questions) if (q.kind === 'choice' && q.options?.[0]) seed[q.id] = q.options[0]
      setAnswers(seed)
      setPhase('questions')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('input')
    }
  }

  function handleEvent(evt: GenEvent) {
    if (evt.type === 'outline') {
      // Don't clear sections here — on continue/resume the server replays every
      // section (cached ones included) by index, so keeping them avoids a flash.
      setOutline(evt.outline)
      setFormat(evt.outline.format)
    } else if (evt.type === 'section') {
      setGenSections((prev) => {
        const next = prev.slice()
        next[evt.index] = evt.section
        return next
      })
    } else if (evt.type === 'done' || evt.type === 'paused') {
      setOutline(evt.outline)
      setDone({
        slug: evt.slug,
        previewUrl: evt.previewUrl,
        format: evt.format,
        imagePrompts: evt.imagePrompts,
        issues: evt.issues,
      })
      setRemaining(evt.total - evt.done)
      setPhase('done')
    } else if (evt.type === 'error') {
      setError(evt.error)
      setPhase('questions')
    }
  }

  async function runGenerate() {
    if (!brief) return
    setError(null)
    setDone(null)
    setRemaining(0)
    // Keep outline + genSections so the next batch streams in under the existing
    // sections (a fresh run already starts empty; reset() clears between stories).
    setPhase('generating')
    try {
      const res = await fetch('/api/vizmaya/compose/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // sessionId drives resume + persistence; sources/brief are a fallback
        // if the session file is missing.
        body: JSON.stringify({ sessionId, answers, format, model, sources, brief }),
      })
      // Auth / validation failures come back as JSON, not a stream.
      if (!res.ok || !res.body || res.headers.get('content-type')?.includes('application/json')) {
        const data = (await res.json().catch(() => null)) as ErrorResponse | null
        throw new Error(data?.error ?? 'generation failed')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          handleEvent(JSON.parse(line.slice(5).trim()) as GenEvent)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('questions')
    }
  }

  async function regenerateSection(index: number) {
    if (!brief || !outline || !done) return
    setError(null)
    setRegenIndex(index)
    try {
      const res = await fetch('/api/vizmaya/compose/regenerate-section', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          index,
          feedback: feedbacks[index] ?? '',
          model,
          // Fallback payload if the session file is gone.
          slug: done.slug,
          outline,
          sections: genSections,
          sources,
          brief,
          answers,
        }),
      })
      const data = (await res.json()) as
        | { ok: true; index: number; section: GeneratedSection; issues: ValidationIssue[] }
        | { error: string }
      if (!res.ok || !('ok' in data)) throw new Error('error' in data ? data.error : 'regenerate failed')
      setGenSections((prev) => {
        const next = prev.slice()
        next[index] = data.section
        return next
      })
      setDone((d) => (d ? { ...d, issues: data.issues } : d))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRegenIndex(null)
    }
  }

  async function resumeSession(id: string) {
    setError(null)
    try {
      const res = await fetch(`/api/vizmaya/compose/sessions/${id}`)
      const data = (await res.json()) as
        | {
            ok: true
            session: LoadedSession
            previewUrl: string | null
            issues: ValidationIssue[]
            imagePrompts: ImagePrompt[]
            done: number
            total: number
          }
        | { error: string }
      if (!res.ok || !('ok' in data)) throw new Error('error' in data ? data.error : 'failed to load session')
      const s = data.session
      const fmt = s.format ?? s.brief.suggestedFormat
      setSessionId(s.id)
      setSources(s.sources ?? [])
      setFailures([])
      setBrief(s.brief)
      setQuestions(s.brief.questions)
      setAnswers(s.answers ?? {})
      setModel(s.model || DEFAULT_TEXT_MODEL)
      setFormat(fmt)
      setFeedbacks({})
      if (s.outline) {
        setOutline(s.outline)
        setGenSections((s.sections ?? []) as GeneratedSection[])
        setDone(
          s.slug
            ? {
                slug: s.slug,
                previewUrl: data.previewUrl ?? `/story/${s.slug}`,
                format: fmt,
                imagePrompts: data.imagePrompts ?? [],
                issues: data.issues ?? [],
              }
            : null,
        )
        setRemaining((data.total || s.outline.sections.length) - (data.done || 0))
        setPhase('done')
      } else {
        setOutline(null)
        setGenSections([])
        setDone(null)
        setRemaining(0)
        setPhase('questions')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function removeSession(id: string) {
    try {
      await fetch(`/api/vizmaya/compose/sessions/${id}`, { method: 'DELETE' })
    } catch {
      // ignore — best effort
    }
    setPastSessions((prev) => prev.filter((s) => s.id !== id))
  }

  function reset() {
    setPhase('input')
    setError(null)
    setFailures([])
    setSessionId(null)
    setSources([])
    setBrief(null)
    setQuestions([])
    setAnswers({})
    setOutline(null)
    setGenSections([])
    setDone(null)
    setRemaining(0)
    setFeedbacks({})
    setRegenIndex(null)
  }

  const stubs = outline?.sections ?? []

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 text-neutral-100">
        <h1 className="text-xl font-semibold">Compose a story from sources</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Paste links and drop files. The agent researches them, asks a few questions, then writes a
          Deck or mapStory section by section — regenerate any section you don&apos;t like.
        </p>

        {error && (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {failures.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
            <div className="font-medium">{failures.length} source(s) skipped:</div>
            <ul className="mt-1 space-y-0.5">
              {failures.map((f, i) => (
                <li key={i}>
                  <span className="text-amber-200/80">{f.origin}</span> — {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Resume a previous session (survives a reload). */}
        {phase === 'input' && pastSessions.length > 0 && (
          <section className={`mt-6 ${card}`}>
            <div className={label}>Resume a session</div>
            <div className="mt-2 space-y-2">
              {pastSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-md border border-white/10 bg-neutral-950/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-neutral-200">{s.title}</div>
                    <div className="text-xs text-neutral-500">
                      {s.status}
                      {' · '}
                      {s.total ? `${s.done}/${s.total} sections` : 'not generated'}
                      {s.format ? ` · ${s.format}` : ''}
                      {' · '}
                      {new Date(s.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => resumeSession(s.id)}
                    className="rounded-md border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs text-sky-200 hover:bg-sky-500/20"
                  >
                    Resume
                  </button>
                  <button
                    onClick={() => removeSession(s.id)}
                    title="Delete session"
                    className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-500 hover:border-red-400/40 hover:text-red-300"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Step 1 — sources */}
        <section className={`mt-6 ${card}`}>
          <div className={label}>Sources</div>
          <textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            disabled={phase !== 'input'}
            rows={4}
            placeholder={'https://example.com/article\nhttps://example.com/data.pdf'}
            className="mt-2 w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-white/30 disabled:opacity-60"
          />
          <div className="mt-3 flex items-center gap-3">
            <input
              type="file"
              multiple
              accept=".pdf,.csv,.json,.txt,.md,.markdown,.html,.htm,.eml"
              disabled={phase !== 'input'}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="text-sm text-neutral-400 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-neutral-100"
            />
            {files.length > 0 && (
              <span className="text-xs text-neutral-500">{files.length} file(s)</span>
            )}
          </div>

          <div className="mt-3">
            <div className={label}>Model</div>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-white/30 disabled:opacity-60"
            >
              {TEXT_MODEL_CHOICES.map((m) => (
                <option key={m.alias} value={m.alias}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">Used for research, outline, and each section.</p>
          </div>

          {phase === 'input' && (
            <button
              onClick={runResearch}
              disabled={busy || (!links.trim() && files.length === 0)}
              className={`mt-4 bg-sky-500 text-white hover:bg-sky-400 ${btn}`}
            >
              Research
            </button>
          )}
          {phase === 'researching' && (
            <div className="mt-4 text-sm text-neutral-400">Reading sources and researching…</div>
          )}
        </section>

        {/* Step 2 — brief + questions */}
        {brief && phase !== 'input' && (
          <section className={`mt-4 ${card}`}>
            <div className={label}>Brief</div>
            <p className="mt-2 text-sm text-neutral-300">{brief.summary}</p>
            {brief.keyFacts.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-neutral-400">
                {brief.keyFacts.slice(0, 6).map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}

            <div className={`mt-5 ${label}`}>Format</div>
            <div className="mt-2 flex gap-2">
              {(['deck', 'map'] as StoryFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  disabled={phase === 'generating' || phase === 'done'}
                  className={`${btn} border ${
                    format === f
                      ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                      : 'border-white/10 text-neutral-300 hover:border-white/30'
                  }`}
                >
                  {f === 'deck' ? 'Deck' : 'mapStory'}
                  {brief.suggestedFormat === f && (
                    <span className="ml-1 text-[10px] text-neutral-500">suggested</span>
                  )}
                </button>
              ))}
            </div>

            <div className={`mt-5 ${label}`}>Questions</div>
            <div className="mt-2 space-y-4">
              {questions.map((q) => (
                <div key={q.id}>
                  <div className="text-sm font-medium text-neutral-200">{q.question}</div>
                  {q.why && <div className="text-xs text-neutral-500">{q.why}</div>}
                  {q.kind === 'choice' && q.options ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {q.options.map((opt) => (
                        <label
                          key={opt}
                          className={`cursor-pointer rounded-md border px-3 py-1 text-sm ${
                            answers[q.id] === opt
                              ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                              : 'border-white/10 text-neutral-300 hover:border-white/30'
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={opt}
                            checked={answers[q.id] === opt}
                            onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                            className="hidden"
                            disabled={phase === 'generating' || phase === 'done'}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      disabled={phase === 'generating' || phase === 'done'}
                      className="mt-1 w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-white/30"
                    />
                  )}
                </div>
              ))}
            </div>

            {phase !== 'done' && (
              <button
                onClick={runGenerate}
                disabled={busy}
                className={`mt-5 bg-emerald-500 text-white hover:bg-emerald-400 ${btn}`}
              >
                {phase === 'generating'
                  ? 'Generating…'
                  : outline
                    ? `Resume generation (${genSections.filter(Boolean).length}/${outline.sections.length} saved)`
                    : 'Generate story'}
              </button>
            )}
          </section>
        )}

        {/* Step 3 — story building live, section by section (stays visible after
            an error so you can see what was saved and resume). */}
        {(phase === 'generating' || phase === 'done' || !!outline) && (
          <section className={`mt-4 ${card}`}>
            <div className="flex items-center justify-between">
              <div className={label}>
                {phase === 'generating' ? 'Writing the story…' : 'Story'}
              </div>
              {outline && (
                <span className="text-xs text-neutral-500">
                  {genSections.filter(Boolean).length}/{stubs.length} sections
                </span>
              )}
            </div>

            {outline && (
              <div className="mt-1">
                <div className="text-base font-semibold text-neutral-100">{outline.title}</div>
                <div className="text-sm text-neutral-400">{outline.subtitle}</div>
              </div>
            )}
            {!outline && phase === 'generating' && (
              <div className="mt-2 text-sm text-neutral-400">Planning the outline…</div>
            )}

            <div className="mt-4 space-y-3">
              {stubs.map((stub, i) => {
                const section = genSections[i]
                const regenerating = regenIndex === i
                return (
                  <div key={i} className="rounded-md border border-white/10 bg-neutral-950/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-neutral-200">
                        {section?.heading ?? stub.heading}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-neutral-600">
                        {stub.kind}
                      </span>
                    </div>
                    {section ? (
                      <p className="mt-1 line-clamp-3 text-xs text-neutral-400">
                        {section.paragraphs[0] ?? '—'}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-neutral-500">
                        {regenerating ? 'Regenerating…' : phase === 'generating' ? 'Writing…' : stub.intent}
                      </p>
                    )}

                    {phase === 'done' && section && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={feedbacks[i] ?? ''}
                          onChange={(e) => setFeedbacks((f) => ({ ...f, [i]: e.target.value }))}
                          placeholder="What to change (optional)…"
                          disabled={regenIndex !== null}
                          className="flex-1 rounded-md border border-white/10 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-white/30 disabled:opacity-60"
                        />
                        <button
                          onClick={() => regenerateSection(i)}
                          disabled={regenIndex !== null}
                          className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-300 hover:border-white/30 disabled:opacity-40"
                        >
                          {regenerating ? '…' : 'Regenerate'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Continue — generate the next batch of sections. */}
            {phase === 'done' && remaining > 0 && (
              <button
                onClick={runGenerate}
                disabled={busy}
                className={`mt-3 w-full bg-emerald-500 text-white hover:bg-emerald-400 ${btn}`}
              >
                Continue — generate next {Math.min(3, remaining)} (
                {genSections.filter(Boolean).length}/{stubs.length} done)
              </button>
            )}
            {phase === 'generating' && outline && (
              <div className="mt-3 text-sm text-neutral-400">Writing the next sections…</div>
            )}

            {done && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <a
                  href={done.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400"
                >
                  Open in vizmaya →
                </a>
                <button
                  onClick={reset}
                  className={`ml-3 border border-white/10 text-neutral-300 hover:border-white/30 ${btn}`}
                >
                  Start over
                </button>
                <span className="ml-3 text-xs text-neutral-500">{done.slug}</span>

                {done.issues.length > 0 && (
                  <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    <div className="font-medium">Residual validation notes:</div>
                    <ul className="mt-1 list-disc pl-4">
                      {done.issues.map((iss, idx) => (
                        <li key={idx}>
                          {[iss.section, iss.layer].filter(Boolean).join(' / ')} — {iss.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {done.imagePrompts.length > 0 && (
                  <details className="mt-3 text-xs text-neutral-400">
                    <summary className="cursor-pointer">{done.imagePrompts.length} image prompt(s)</summary>
                    <ul className="mt-1 space-y-1">
                      {done.imagePrompts.map((p, idx) => (
                        <li key={idx}>
                          <span className="text-neutral-500">[{p.section}]</span> {p.prompt}{' '}
                          <span className="text-neutral-600">({p.aspectRatio})</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
