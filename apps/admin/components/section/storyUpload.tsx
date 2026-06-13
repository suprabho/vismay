'use client'

import Link from 'next/link'
import { useRef, useState, type ReactNode } from 'react'

export interface UploadResult {
  ok: boolean
  slug?: string
  details: string[]
  charts: string[]
  skipped: string[]
  errors: string[]
}

/**
 * Bulk single-story upload: take a multi-file selection that makes up one story
 * (one .md + optional .config.yaml/.share.yaml + chart .json files) and write
 * them via the existing PUT routes. Slug is derived from the .md filename so the
 * same payload works for create and replace. When scoped to an app the story is
 * tagged to it so it lands in that list.
 *
 * Shared by StoriesListClient (footshorts + apps) and the Vizmaya StoriesManager.
 */
export function useStoryUpload(
  appSlug: string | null,
  onUploaded: () => void | Promise<void>
) {
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadStory(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    setUploadBusy(true)
    setUploadResult(null)

    const finish = (result: UploadResult) => {
      setUploadResult(result)
      setUploadBusy(false)
    }

    const mdFiles = files.filter((f) => /\.(md|markdown)$/i.test(f.name))
    if (mdFiles.length === 0) {
      finish({
        ok: false,
        details: [],
        charts: [],
        skipped: [],
        errors: ['No .md file in selection — needed to determine the story slug.'],
      })
      return
    }
    if (mdFiles.length > 1) {
      finish({
        ok: false,
        details: [],
        charts: [],
        skipped: [],
        errors: [
          `Multiple .md files (${mdFiles.map((f) => f.name).join(', ')}) — upload one story at a time.`,
        ],
      })
      return
    }

    const mdFile = mdFiles[0]
    const slug = mdFile.name.replace(/\.(md|markdown)$/i, '')
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      finish({
        ok: false,
        details: [],
        charts: [],
        skipped: [],
        errors: [`Bad slug "${slug}" from "${mdFile.name}". Slug must match [a-zA-Z0-9_-].`],
      })
      return
    }

    const configFiles = files.filter((f) => /\.config\.ya?ml$/i.test(f.name))
    const shareFiles = files.filter((f) => /\.share\.ya?ml$/i.test(f.name))
    const jsonFiles = files.filter((f) => /\.json$/i.test(f.name))
    const claimed = new Set([mdFile, ...configFiles, ...shareFiles, ...jsonFiles])
    const skipped = files.filter((f) => !claimed.has(f)).map((f) => f.name)

    if (configFiles.length > 1) {
      finish({
        ok: false,
        details: [],
        charts: [],
        skipped,
        errors: [`Multiple config files: ${configFiles.map((f) => f.name).join(', ')}`],
      })
      return
    }
    if (shareFiles.length > 1) {
      finish({
        ok: false,
        details: [],
        charts: [],
        skipped,
        errors: [`Multiple share files: ${shareFiles.map((f) => f.name).join(', ')}`],
      })
      return
    }

    const markdown = await mdFile.text()
    const configText = configFiles[0] ? await configFiles[0].text() : null
    const shareText = shareFiles[0] ? await shareFiles[0].text() : null

    const payload: Record<string, unknown> = { markdown }
    if (configText !== null) payload.config_yaml = configText
    if (shareText !== null) payload.share_yaml = shareText
    if (appSlug) payload.appSlug = appSlug

    const res = await fetch(`/api/stories/${slug}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      finish({
        ok: false,
        slug,
        details: [],
        charts: [],
        skipped,
        errors: [body?.error ?? `HTTP ${res.status}`],
      })
      return
    }

    const details: string[] = [`markdown ← ${mdFile.name}`]
    if (configText !== null) details.push(`config ← ${configFiles[0].name}`)
    if (shareText !== null) details.push(`share ← ${shareFiles[0].name}`)
    if (body?.warning) details.push(`server warning: ${body.warning}`)
    if (body?.error && body?.warning) details.push(`(${body.error})`)

    // Charts — each one is a separate request via the existing chart route.
    const chartIds: string[] = []
    const errors: string[] = []
    for (const f of jsonFiles) {
      const id = f.name.replace(/\.json$/i, '')
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        errors.push(`${f.name}: chart id must match [a-zA-Z0-9_-]`)
        continue
      }
      const text = await f.text()
      try {
        JSON.parse(text)
      } catch (err) {
        errors.push(`${f.name}: JSON parse — ${err instanceof Error ? err.message : 'invalid'}`)
        continue
      }
      const cr = await fetch(`/api/stories/${slug}/charts/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ raw: text }),
      })
      if (!cr.ok) {
        const cb = await cr.json().catch(() => null)
        errors.push(`${f.name}: ${cb?.error ?? `HTTP ${cr.status}`}`)
        continue
      }
      chartIds.push(id)
    }

    await onUploaded()
    finish({
      ok: errors.length === 0,
      slug,
      details,
      charts: chartIds,
      skipped,
      errors,
    })
  }

  const fileInput: ReactNode = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept=".md,.markdown,.yaml,.yml,.json,text/markdown,text/yaml,application/yaml,application/json"
      onChange={uploadStory}
      className="hidden"
    />
  )

  return {
    uploadBusy,
    uploadResult,
    setUploadResult,
    openPicker: () => inputRef.current?.click(),
    fileInput,
  }
}

export function UploadResultBanner({
  result,
  basePath,
  onDismiss,
}: {
  result: UploadResult
  basePath: string
  onDismiss: () => void
}) {
  const hasError = !result.ok || result.errors.length > 0
  return (
    <div
      className={`px-4 py-2 text-xs border-b border-white/5 ${
        hasError ? 'bg-red-950/20 text-red-300' : 'bg-emerald-950/20 text-emerald-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          {result.slug && (
            <div>
              <span className="text-neutral-400">Story:</span>{' '}
              <Link href={`${basePath}/${result.slug}`} className="underline">
                {result.slug}
              </Link>
            </div>
          )}
          {result.details.length > 0 && (
            <div>
              <span className="text-neutral-400">Saved:</span> {result.details.join(', ')}
            </div>
          )}
          {result.charts.length > 0 && (
            <div>
              <span className="text-neutral-400">Charts uploaded:</span>{' '}
              {result.charts.map((id) => `${id}.json`).join(', ')}
            </div>
          )}
          {result.skipped.length > 0 && (
            <div className="text-neutral-500">
              Skipped (unrecognized): {result.skipped.join(', ')}
            </div>
          )}
          {result.errors.length > 0 && (
            <ul className="list-disc list-inside">
              {result.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-neutral-400 hover:text-white shrink-0"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
