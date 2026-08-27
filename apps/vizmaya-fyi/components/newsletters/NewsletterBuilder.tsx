'use client'

import { useCallback, useMemo, useState } from 'react'
import { stringify as stringifyYaml } from 'yaml'
import {
  parseNewsletterConfig,
  type NewsletterSectionOverride,
} from '@vismay/content-source/storyNewsletterConfig'
import { usePollNewsletterRender } from '@vismay/content-source/usePollNewsletterRender'

export interface NewsletterBuilderUnit {
  parentIndex: number
  subIndex: number
  kind: string
  heading: string | undefined
  subheading: string | undefined
  paragraphs: string[]
  hasMap: boolean
  hasViz: boolean
  hasPanel: boolean
}

interface Props {
  slug: string
  title: string
  units: NewsletterBuilderUnit[]
  initialYaml: string | null
  /** Bucket URLs of the last render (cache-busted), if any. */
  initialUrls: { email: string | null; substack: string | null }
}

interface UnitState {
  parentIndex: number
  subIndex: number
  include: boolean
  hideText: boolean
  hideMap: boolean
  hideVisual: boolean
  heading: string
  caption: string
}

function unitKey(u: { parentIndex: number; subIndex: number }): string {
  return `${u.parentIndex}.${u.subIndex}`
}

function buildInitialState(units: NewsletterBuilderUnit[], initialYaml: string | null) {
  const cfg = parseNewsletterConfig(initialYaml)
  const byKey = new Map<string, NewsletterSectionOverride>()
  for (const s of cfg.sections) byKey.set(`${s.parentIndex}.${s.subIndex}`, s)
  const unitStates = units.map((u): UnitState => {
    const ov = byKey.get(unitKey(u))
    return {
      parentIndex: u.parentIndex,
      subIndex: u.subIndex,
      include: ov?.include !== false,
      hideText: ov?.hideText === true,
      hideMap: ov?.hideMap === true,
      hideVisual: ov?.hideVisual === true,
      heading: ov?.heading ?? '',
      caption: ov?.caption ?? '',
    }
  })
  return {
    unitStates,
    subject: cfg.subject ?? '',
    preheader: cfg.preheader ?? '',
    intro: cfg.intro ?? '',
    outro: cfg.outro ?? '',
    ctaLabel: cfg.cta?.label ?? '',
    ctaUrl: cfg.cta?.url ?? '',
  }
}

export default function NewsletterBuilder({
  slug,
  title,
  units,
  initialYaml,
  initialUrls,
}: Props) {
  const initial = useMemo(() => buildInitialState(units, initialYaml), [units, initialYaml])

  const [unitStates, setUnitStates] = useState<UnitState[]>(initial.unitStates)
  const [subject, setSubject] = useState(initial.subject)
  const [preheader, setPreheader] = useState(initial.preheader)
  const [intro, setIntro] = useState(initial.intro)
  const [outro, setOutro] = useState(initial.outro)
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel)
  const [ctaUrl, setCtaUrl] = useState(initial.ctaUrl)

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const { state, publicUrl, substackUrl, error, trigger } = usePollNewsletterRender(slug)

  const emailUrl = publicUrl ?? initialUrls.email
  const pasteUrl = substackUrl ?? initialUrls.substack

  const patchUnit = useCallback((idx: number, patch: Partial<UnitState>) => {
    setUnitStates((prev) => prev.map((u, i) => (i === idx ? { ...u, ...patch } : u)))
    setDirty(true)
  }, [])

  const serializeYaml = useCallback((): string => {
    const doc: Record<string, unknown> = {}
    if (subject.trim()) doc.subject = subject.trim()
    if (preheader.trim()) doc.preheader = preheader.trim()
    if (intro.trim()) doc.intro = intro.trim()
    if (outro.trim()) doc.outro = outro.trim()
    if (ctaLabel.trim() || ctaUrl.trim()) {
      const cta: Record<string, string> = {}
      if (ctaLabel.trim()) cta.label = ctaLabel.trim()
      if (ctaUrl.trim()) cta.url = ctaUrl.trim()
      doc.cta = cta
    }
    const sections: Record<string, unknown>[] = []
    for (const u of unitStates) {
      const entry: Record<string, unknown> = {}
      if (!u.include) entry.include = false
      if (u.hideText) entry.hideText = true
      if (u.hideMap) entry.hideMap = true
      if (u.hideVisual) entry.hideVisual = true
      if (u.heading.trim()) entry.heading = u.heading.trim()
      if (u.caption.trim()) entry.caption = u.caption.trim()
      if (Object.keys(entry).length === 0) continue
      sections.push({
        unit: { parentIndex: u.parentIndex, subIndex: u.subIndex },
        ...entry,
      })
    }
    if (sections.length > 0) doc.sections = sections
    if (Object.keys(doc).length === 0) return ''
    return stringifyYaml(doc)
  }, [subject, preheader, intro, outro, ctaLabel, ctaUrl, unitStates])

  const handleSave = useCallback(async (): Promise<boolean> => {
    setSaving(true)
    setSaveError(null)
    try {
      const r = await fetch(`/api/story-newsletter-config/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: serializeYaml() }),
      })
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${r.status}`)
      }
      setDirty(false)
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'save failed')
      return false
    } finally {
      setSaving(false)
    }
  }, [slug, serializeYaml])

  const handleRender = useCallback(async () => {
    setActionError(null)
    if (dirty) {
      const ok = await handleSave()
      if (!ok) return
    }
    try {
      await trigger({ force: true })
    } catch {
      // trigger stores the error in `error`
    }
  }, [dirty, handleSave, trigger])

  // Storage paths are stable across renders, so Supabase's CDN can serve a
  // stale object right after a re-render — a unique query param forces an
  // origin fetch (the CDN keys on the full URL).
  const bustCdn = (url: string) =>
    `${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`

  const handleCopySubstack = useCallback(async () => {
    if (!pasteUrl) return
    setActionError(null)
    setCopied(false)
    try {
      const res = await fetch(bustCdn(pasteUrl), { cache: 'no-store' })
      if (!res.ok) throw new Error(`fetch newsletter HTML: HTTP ${res.status}`)
      const html = await res.text()
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
      const fragment = (bodyMatch ? bodyMatch[1] : html).trim()
      const plain = fragment
        .replace(/<\/(p|h\d|figure|blockquote|li)>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([fragment], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'copy failed')
    }
  }, [pasteUrl])

  const handleDownload = useCallback(async () => {
    if (!emailUrl) return
    setActionError(null)
    try {
      const res = await fetch(bustCdn(emailUrl), { cache: 'no-store' })
      if (!res.ok) throw new Error(`fetch newsletter HTML: HTTP ${res.status}`)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${slug}-newsletter.html`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'download failed')
    }
  }, [emailUrl, slug])

  const rendering = state === 'rendering'
  const includedCount = unitStates.filter((u) => u.include).length

  // Re-key the preview per publicUrl change; memo so the buster doesn't
  // regenerate (and reload the iframe) on every state update.
  const previewSrc = useMemo(
    () => (emailUrl ? bustCdn(emailUrl) : null),
    [emailUrl]
  )

  const label = (text: string) => (
    <label
      className="block font-[family-name:var(--font-mono)] text-[0.6rem] uppercase tracking-[0.15em] mb-1"
      style={{ color: 'var(--color-muted)' }}
    >
      {text}
    </label>
  )

  const inputStyle = {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-surface)',
    color: 'var(--color-text)',
  } as const

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-3 sm:px-6 py-3 border-b flex-wrap"
        style={{ borderColor: 'var(--color-surface)' }}
      >
        <div className="min-w-0">
          <div
            className="font-[family-name:var(--font-mono)] text-[0.6rem] uppercase tracking-[0.18em]"
            style={{ color: 'var(--color-accent)' }}
          >
            Newsletter builder
          </div>
          <h1 className="font-serif font-bold text-lg truncate">{title}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-4 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
          >
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
          <button
            onClick={handleRender}
            disabled={rendering}
            className="px-4 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider border disabled:opacity-40"
            style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text)' }}
          >
            {rendering ? 'Rendering…' : 'Render newsletter'}
          </button>
          <button
            onClick={handleCopySubstack}
            disabled={!pasteUrl}
            className="px-4 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider border disabled:opacity-40"
            style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text)' }}
            title="Copies the Substack-ready rich text — paste straight into a new Substack post"
          >
            {copied ? 'Copied ✓' : 'Copy for Substack'}
          </button>
          <button
            onClick={handleDownload}
            disabled={!emailUrl}
            className="px-4 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider border disabled:opacity-40"
            style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text)' }}
          >
            Download HTML
          </button>
        </div>
      </div>
      {(saveError || error || actionError) && (
        <div
          className="px-3 sm:px-6 py-2 text-[0.75rem]"
          style={{ background: 'var(--color-surface)', color: 'var(--color-warn, #ff6b6b)' }}
        >
          {saveError ?? error ?? actionError}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Controls */}
        <div
          className="md:w-[440px] flex-shrink-0 md:overflow-y-auto border-b md:border-b-0 md:border-r p-4 space-y-4"
          style={{ borderColor: 'var(--color-surface)' }}
        >
          {/* Issue framing */}
          <div
            className="rounded-lg border p-3 space-y-3"
            style={{ borderColor: 'var(--color-surface)' }}
          >
            <div
              className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.15em]"
              style={{ color: 'var(--color-accent)' }}
            >
              Issue
            </div>
            <div>
              {label('Subject (defaults to story title)')}
              <input
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setDirty(true) }}
                className="w-full rounded px-2 py-1.5 text-sm"
                style={inputStyle}
                placeholder={title}
              />
            </div>
            <div>
              {label('Preheader (inbox preview text)')}
              <input
                value={preheader}
                onChange={(e) => { setPreheader(e.target.value); setDirty(true) }}
                className="w-full rounded px-2 py-1.5 text-sm"
                style={inputStyle}
              />
            </div>
            <div>
              {label('Intro paragraphs')}
              <textarea
                value={intro}
                onChange={(e) => { setIntro(e.target.value); setDirty(true) }}
                rows={3}
                className="w-full rounded px-2 py-1.5 text-sm"
                style={inputStyle}
              />
            </div>
            <div>
              {label('Outro paragraphs')}
              <textarea
                value={outro}
                onChange={(e) => { setOutro(e.target.value); setDirty(true) }}
                rows={2}
                className="w-full rounded px-2 py-1.5 text-sm"
                style={inputStyle}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                {label('CTA label')}
                <input
                  value={ctaLabel}
                  onChange={(e) => { setCtaLabel(e.target.value); setDirty(true) }}
                  className="w-full rounded px-2 py-1.5 text-sm"
                  style={inputStyle}
                  placeholder="Read the full interactive story"
                />
              </div>
              <div>
                {label('CTA url')}
                <input
                  value={ctaUrl}
                  onChange={(e) => { setCtaUrl(e.target.value); setDirty(true) }}
                  className="w-full rounded px-2 py-1.5 text-sm"
                  style={inputStyle}
                  placeholder={`/story/${slug}`}
                />
              </div>
            </div>
          </div>

          {/* Section picker */}
          <div
            className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.15em]"
            style={{ color: 'var(--color-accent)' }}
          >
            Sections · {includedCount}/{unitStates.length} in
          </div>
          {units.map((u, i) => {
            const s = unitStates[i]
            const visuals = [
              u.hasMap ? 'map' : null,
              u.hasViz ? 'chart' : null,
              u.hasPanel ? 'panel' : null,
            ].filter(Boolean)
            return (
              <div
                key={unitKey(u)}
                className="rounded-lg border p-3 space-y-2"
                style={{
                  borderColor: 'var(--color-surface)',
                  opacity: s.include ? 1 : 0.45,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className="font-[family-name:var(--font-mono)] text-[0.6rem] uppercase tracking-[0.12em]"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      §{u.parentIndex}.{u.subIndex} · {u.kind}
                      {visuals.length > 0 ? ` · ${visuals.join(' + ')}` : ' · text only'}
                    </div>
                    <div className="text-sm font-medium truncate">
                      {u.heading || u.paragraphs[0]?.slice(0, 64) || '(untitled)'}
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 text-[0.7rem] flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={s.include}
                      onChange={(e) => patchUnit(i, { include: e.target.checked })}
                    />
                    in
                  </label>
                </div>
                {s.include && (
                  <>
                    <div
                      className="flex flex-wrap gap-3 text-[0.7rem]"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={!s.hideText}
                          onChange={(e) => patchUnit(i, { hideText: !e.target.checked })}
                        />
                        text
                      </label>
                      {u.hasMap && (
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={!s.hideMap}
                            onChange={(e) => patchUnit(i, { hideMap: !e.target.checked })}
                          />
                          map image
                        </label>
                      )}
                      {(u.hasViz || u.hasPanel) && (
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={!s.hideVisual}
                            onChange={(e) => patchUnit(i, { hideVisual: !e.target.checked })}
                          />
                          {u.hasPanel ? 'panel image' : 'chart image'}
                        </label>
                      )}
                    </div>
                    <input
                      value={s.heading}
                      onChange={(e) => patchUnit(i, { heading: e.target.value })}
                      className="w-full rounded px-2 py-1 text-xs"
                      style={inputStyle}
                      placeholder="Heading override"
                    />
                    {(u.hasMap || u.hasViz || u.hasPanel) && (
                      <input
                        value={s.caption}
                        onChange={(e) => patchUnit(i, { caption: e.target.value })}
                        className="w-full rounded px-2 py-1 text-xs"
                        style={inputStyle}
                        placeholder="Image caption"
                      />
                    )}
                  </>
                )}
              </div>
            )
          })}

          {/* Substack how-to */}
          <div
            className="rounded-lg border p-3 text-[0.75rem] leading-relaxed space-y-1.5"
            style={{ borderColor: 'var(--color-surface)', color: 'var(--color-muted)' }}
          >
            <div
              className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.15em]"
              style={{ color: 'var(--color-accent)' }}
            >
              Publish to Substack
            </div>
            <p>1. Render, then hit <strong>Copy for Substack</strong>.</p>
            <p>
              2. In Substack: New post → set the title/subtitle → paste into the
              body. Substack re-uploads the images to its CDN automatically.
            </p>
            <p>
              3. Publish — it goes out as the email newsletter and the blog
              post in one step. The <strong>Download HTML</strong> file is the
              email-styled variant for any other ESP.
            </p>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 relative min-h-[60vh]" style={{ background: 'var(--color-surface)' }}>
          {previewSrc ? (
            <iframe
              key={previewSrc}
              src={previewSrc}
              className="absolute inset-0 w-full h-full border-0"
              style={{ background: '#f4f4f6' }}
              title="Newsletter preview"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center text-sm"
              style={{ color: 'var(--color-muted)' }}
            >
              {rendering
                ? 'Rendering the first issue — this can take a minute…'
                : 'No render yet — hit "Render newsletter" to build the first issue.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
