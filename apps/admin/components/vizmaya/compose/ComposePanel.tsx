'use client'

import { useState } from 'react'
// Import the model list from the pure `./models` subpath, NOT the package root:
// the root re-exports the ingest pipeline (jsdom/fs/pdf-parse), which can't be
// bundled into this client component. Types below are erased, so the root is fine.
import { TEXT_MODEL_CHOICES, DEFAULT_TEXT_MODEL } from '@vismay/story-pipeline/models'
import type {
  ResearchBrief,
  ClarifyingQuestion,
  SourceDoc,
  StoryFormat,
  ImagePrompt,
  ValidationIssue,
  IngestFailure,
} from '@vismay/story-pipeline'

type Phase = 'input' | 'researching' | 'questions' | 'generating' | 'done'

interface ResearchResponse {
  ok: true
  sources: SourceDoc[]
  failures: IngestFailure[]
  brief: ResearchBrief
  questions: ClarifyingQuestion[]
}

interface ErrorResponse {
  error: string
  failures?: IngestFailure[]
}

interface GenerateResponse {
  ok: true
  slug: string
  format: StoryFormat
  previewUrl: string
  sections: number
  charts: number
  imagePrompts: ImagePrompt[]
  issues: ValidationIssue[]
}

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

  const [sources, setSources] = useState<SourceDoc[]>([])
  const [failures, setFailures] = useState<IngestFailure[]>([])
  const [brief, setBrief] = useState<ResearchBrief | null>(null)
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [format, setFormat] = useState<StoryFormat>('deck')

  const [result, setResult] = useState<GenerateResponse | null>(null)

  const busy = phase === 'researching' || phase === 'generating'

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
      setSources(data.sources)
      setFailures(data.failures ?? [])
      setBrief(data.brief)
      setQuestions(data.questions)
      setFormat(data.brief.suggestedFormat)
      // Seed choice answers with the first option so the form is never empty.
      const seed: Record<string, string> = {}
      for (const q of data.questions) if (q.kind === 'choice' && q.options?.[0]) seed[q.id] = q.options[0]
      setAnswers(seed)
      setPhase('questions')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('input')
    }
  }

  async function runGenerate() {
    if (!brief) return
    setError(null)
    setPhase('generating')
    try {
      const res = await fetch('/api/vizmaya/compose/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sources, brief, answers, format, model }),
      })
      const data = (await res.json()) as GenerateResponse | { error: string }
      if (!res.ok || !('ok' in data)) {
        throw new Error('error' in data ? data.error : 'generation failed')
      }
      setResult(data)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('questions')
    }
  }

  function reset() {
    setPhase('input')
    setError(null)
    setFailures([])
    setSources([])
    setBrief(null)
    setQuestions([])
    setAnswers({})
    setResult(null)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-neutral-100">
      <h1 className="text-xl font-semibold">Compose a story from sources</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Paste links and drop files. The agent researches them, asks a few questions, then writes a
        Deck or mapStory you can open in vizmaya.
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
          <p className="mt-1 text-xs text-neutral-500">Used for both research and generation.</p>
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
              {phase === 'generating' ? 'Generating…' : 'Generate story'}
            </button>
          )}
        </section>
      )}

      {/* Step 3 — result */}
      {result && (
        <section className={`mt-4 ${card}`}>
          <div className={label}>Done</div>
          <p className="mt-2 text-sm text-neutral-300">
            Generated <strong>{result.slug}</strong> — {result.format}, {result.sections} sections,{' '}
            {result.charts} charts.
          </p>
          <a
            href={result.previewUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400"
          >
            Open in vizmaya →
          </a>
          {result.issues.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <div className="font-medium">Residual validation notes:</div>
              <ul className="mt-1 list-disc pl-4">
                {result.issues.map((i, idx) => (
                  <li key={idx}>
                    {[i.section, i.layer].filter(Boolean).join(' / ')} — {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.imagePrompts.length > 0 && (
            <details className="mt-3 text-xs text-neutral-400">
              <summary className="cursor-pointer">{result.imagePrompts.length} image prompt(s)</summary>
              <ul className="mt-1 space-y-1">
                {result.imagePrompts.map((p, idx) => (
                  <li key={idx}>
                    <span className="text-neutral-500">[{p.section}]</span> {p.prompt}{' '}
                    <span className="text-neutral-600">({p.aspectRatio})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button onClick={reset} className={`ml-3 border border-white/10 text-neutral-300 hover:border-white/30 ${btn}`}>
            Start over
          </button>
        </section>
      )}
    </div>
  )
}
