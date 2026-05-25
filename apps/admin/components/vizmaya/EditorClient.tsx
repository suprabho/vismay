'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import ThemeEditor from './ThemeEditor'
import CodeEditor from './CodeEditor'
import YamlConfigEditor from './YamlConfigEditor'
import FileActions from './FileActions'
import NarrationEditor, { type NarrationUnit } from './NarrationEditor'
import AssetsPanel from './AssetsPanel'
import { appStoryUrl, vizmayaUrl } from '@/lib/publicSite'
import type { SignedStoryLinks } from '@/lib/signedConsumerLinks'
import { parseFrontmatter, serializeFrontmatter } from '@vismay/content-source/frontmatter'
import type { Theme } from '@vismay/viz-engine'
import type { CachedVideo } from '@vismay/content-source/storyVideo'
import type { AssetListEntry } from '@/app/api/vizmaya/stories/[slug]/assets/route'

type Tab = 'theme' | 'markdown' | 'config' | 'charts' | 'assets' | 'narration' | 'settings'

interface ChartEntry {
  id: string
  editable: boolean
}

interface InitialState {
  markdown: string
  config_yaml: string
  charts: ChartEntry[]
  assets: AssetListEntry[]
  narrationUnits: NarrationUnit[]
  tts_yaml: string | null
  videoCache: {
    '9:16': CachedVideo | null
    '16:9': CachedVideo | null
  }
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'theme', label: 'Theme' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'config', label: 'Config' },
  { id: 'charts', label: 'Charts' },
  { id: 'assets', label: 'Assets' },
  { id: 'narration', label: 'Narration' },
  { id: 'settings', label: 'Settings' },
]

interface BulkResult {
  applied: string[]
  charts: string[]
  skipped: string[]
  errors: string[]
}

const TAB_IDS = new Set<Tab>(['theme', 'markdown', 'config', 'charts', 'assets', 'narration', 'settings'])
function isTab(v: string | null): v is Tab {
  return v != null && TAB_IDS.has(v as Tab)
}

export default function EditorClient({
  slug,
  appSlug,
  sectionHref,
  initial,
  signedLinks,
}: {
  slug: string
  /** Which consumer app this story belongs to — picks the "preview ↗"
   *  destination (vizf1/footshorts have their own /editorial route; vizmaya
   *  uses /story/<slug>). The server-rendered share/autoplay links stay on
   *  vizmaya.fyi regardless because those gated routes only live there. */
  appSlug: string
  sectionHref: string
  initial: InitialState
  /** Pre-signed URLs for the gated open-in-tab links (autoplay, share).
   *  Server signs on each page render so admin always gets a fresh token. */
  signedLinks: SignedStoryLinks
}) {
  const previewUrl = appStoryUrl(appSlug, slug) ?? vizmayaUrl(`/story/${slug}`)
  const searchParams = useSearchParams()
  const initialTab: Tab = (() => {
    const q = searchParams.get('tab')
    return isTab(q) ? q : 'theme'
  })()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [markdown, setMarkdown] = useState(initial.markdown)
  const [config, setConfig] = useState(initial.config_yaml)
  const [charts, setCharts] = useState(initial.charts)
  const [saving, start] = useTransition()
  const [apiStatus, setApiStatus] = useState<{ type: 'idle' | 'ok' | 'err' | 'warn'; msg?: string }>({ type: 'idle' })
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  const bulkInputRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => parseFrontmatter(markdown), [markdown])
  const theme = (parsed.data.theme ?? undefined) as Partial<Theme> | undefined

  function updateTheme(next: Theme) {
    const nextData = { ...parsed.data, theme: next }
    setMarkdown(serializeFrontmatter(nextData, parsed.body))
  }

  function updateMetadata(meta: Partial<{ status: string; listed: boolean; order: number }>) {
    const nextData = { ...parsed.data, ...meta }
    setMarkdown(serializeFrontmatter(nextData, parsed.body))
  }

  const dirty = useMemo(
    () =>
      markdown !== initial.markdown ||
      config !== initial.config_yaml,
    [markdown, config, initial]
  )

  // Warn before navigating away with unsaved work.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Cmd/Ctrl+S to save (desktop).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty && !saving) save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving, markdown, config])

  function save() {
    start(async () => {
      setApiStatus({ type: 'idle' })
      const payload: Record<string, any> = {}
      if (markdown !== initial.markdown) payload.markdown = markdown
      if (config !== initial.config_yaml) payload.config_yaml = config.length === 0 ? null : config
      if (parsed.data.status) payload.status = parsed.data.status
      if (parsed.data.listed !== undefined) payload.listed = parsed.data.listed
      if (parsed.data.displayOrder !== undefined) payload.displayOrder = parsed.data.displayOrder
      const res = await fetch(`/api/vizmaya/stories/${slug}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setApiStatus({ type: 'err', msg: body?.error ?? `HTTP ${res.status}` })
        return
      }
      if (body?.warning) {
        setApiStatus({ type: 'warn', msg: body.error ?? body.warning })
      } else {
        setApiStatus({ type: 'ok', msg: 'Saved' })
      }
      // Update baseline so dirty goes false.
      initial.markdown = markdown
      initial.config_yaml = config
    })
  }

  // Bulk upload: classify each picked file by its extension and route it.
  // Markdown / YAML files only update the editor buffer (still need Save), but
  // chart JSON is PUT directly because charts have no editor-buffer equivalent.
  async function bulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setBulkBusy(true)
    setBulkResult(null)

    const applied: string[] = []
    const chartIds: string[] = []
    const skipped: string[] = []
    const errors: string[] = []

    let nextMd: string | null = null
    let nextConfig: string | null = null

    for (const file of files) {
      const name = file.name
      const lower = name.toLowerCase()
      try {
        if (lower.endsWith('.config.yaml') || lower.endsWith('.config.yml')) {
          nextConfig = await file.text()
          applied.push(`config ← ${name}`)
        } else if (lower.endsWith('.share.yaml') || lower.endsWith('.share.yml')) {
          // Share has no editor buffer (it's edited on /story/<slug>/share),
          // so persist directly — same pattern as chart JSON below.
          const text = await file.text()
          const res = await fetch(`/api/vizmaya/stories/${slug}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ share_yaml: text.length === 0 ? null : text }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => null)
            errors.push(`${name}: ${body?.error ?? `HTTP ${res.status}`}`)
            continue
          }
          applied.push(`share ← ${name} (saved)`)
        } else if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
          nextMd = await file.text()
          applied.push(`markdown ← ${name}`)
        } else if (lower.endsWith('.json')) {
          const id = name.replace(/\.json$/i, '')
          if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
            errors.push(`${name}: chart id must match [a-zA-Z0-9_-]`)
            continue
          }
          const text = await file.text()
          try {
            JSON.parse(text)
          } catch (err) {
            errors.push(`${name}: JSON parse — ${err instanceof Error ? err.message : 'invalid'}`)
            continue
          }
          const res = await fetch(`/api/vizmaya/stories/${slug}/charts/${id}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ raw: text }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => null)
            errors.push(`${name}: ${body?.error ?? `HTTP ${res.status}`}`)
            continue
          }
          chartIds.push(id)
        } else {
          skipped.push(name)
        }
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : 'read failed'}`)
      }
    }

    if (nextMd != null) setMarkdown(nextMd)
    if (nextConfig != null) setConfig(nextConfig)
    if (chartIds.length > 0) {
      setCharts((prev) => {
        const existing = new Set(prev.map((c) => c.id))
        const additions: ChartEntry[] = chartIds
          .filter((id) => !existing.has(id))
          .map((id) => ({ id, editable: true }))
        return [...prev, ...additions].sort((a, b) => a.id.localeCompare(b.id))
      })
    }

    setBulkBusy(false)
    setBulkResult({ applied, charts: chartIds, skipped, errors })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
        <Link href={sectionHref} className="text-neutral-400 hover:text-white text-sm shrink-0">
          ← all
        </Link>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-neutral-500 truncate">{slug}</div>
        </div>
        <button
          type="button"
          disabled={bulkBusy}
          onClick={() => bulkInputRef.current?.click()}
          className="text-sm text-neutral-400 hover:text-white shrink-0 disabled:opacity-40"
          title="Upload .md, .config.yaml, .share.yaml and chart .json files together"
        >
          {bulkBusy ? 'uploading…' : '↑ upload bundle'}
        </button>
        <input
          ref={bulkInputRef}
          type="file"
          multiple
          accept=".md,.markdown,.yaml,.yml,.json,text/markdown,text/yaml,application/yaml,application/json"
          onChange={bulkUpload}
          className="hidden"
        />
        <Link
          href={signedLinks.reports}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-neutral-400 hover:text-white shrink-0"
        >
          report ↗
        </Link>
        <Link
          href={signedLinks.autoplay}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-neutral-400 hover:text-white shrink-0"
        >
          autoplay ↗
        </Link>
        <Link
          href={signedLinks.share}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-neutral-400 hover:text-white shrink-0"
        >
          share ↗
        </Link>
        <Link
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-neutral-400 hover:text-white shrink-0"
        >
          preview ↗
        </Link>
      </div>
      {bulkResult && (
        <BulkResultBanner result={bulkResult} onDismiss={() => setBulkResult(null)} />
      )}

      <nav className="flex gap-1 px-2 py-2 border-b border-white/5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-3 py-2 rounded-lg text-sm transition-colors ${
              tab === t.id
                ? 'bg-white/10 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {t.label}
            {t.id === 'charts' && charts.length > 0 && (
              <span className="ml-1.5 text-xs text-neutral-500">{charts.length}</span>
            )}
            {t.id === 'assets' && initial.assets.length > 0 && (
              <span className="ml-1.5 text-xs text-neutral-500">{initial.assets.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1 flex flex-col min-h-0">
        {tab === 'theme' && (
          <ThemeEditor
            theme={theme}
            yamlError={parsed.yamlError}
            onChange={updateTheme}
          />
        )}
        {tab === 'markdown' && (
          <>
            <FileActions
              filename={`${slug}.md`}
              accept=".md,.markdown,text/markdown"
              mime="text/markdown;charset=utf-8"
              value={markdown}
              onUpload={setMarkdown}
            />
            <CodeEditor
              value={markdown}
              onChange={setMarkdown}
              language="markdown"
              path={`${slug}.md`}
            />
          </>
        )}
        {tab === 'config' && (
          <>
            <FileActions
              filename={`${slug}.config.yaml`}
              accept=".yaml,.yml,text/yaml,application/yaml"
              mime="application/yaml;charset=utf-8"
              value={config}
              onUpload={setConfig}
            />
            <YamlConfigEditor
              value={config}
              onChange={setConfig}
              path={`${slug}.config.yaml`}
            />
          </>
        )}
        {tab === 'charts' && (
          <ChartsList
            slug={slug}
            sectionHref={sectionHref}
            charts={charts}
            onChartsChange={setCharts}
          />
        )}
        {tab === 'assets' && (
          <AssetsPanel slug={slug} initialAssets={initial.assets} />
        )}
        {tab === 'narration' && (
          <NarrationEditor
            slug={slug}
            units={initial.narrationUnits}
            initialYaml={initial.tts_yaml}
            videoCache={initial.videoCache}
            onSaved={(yaml) => {
              initial.tts_yaml = yaml
            }}
          />
        )}
        {tab === 'settings' && (
          <SettingsPanel
            status={(parsed.data.status as string) ?? 'published'}
            listed={parsed.data.listed !== false}
            displayOrder={typeof parsed.data.displayOrder === 'number' ? parsed.data.displayOrder : null}
            onChange={updateMetadata}
          />
        )}
      </div>

      <div
        className="sticky bottom-0 border-t border-white/10 bg-neutral-950/95 backdrop-blur flex items-center gap-3 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
      >
        <StatusBadge status={apiStatus} dirty={dirty} />
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="ml-auto bg-white text-neutral-950 rounded-lg px-5 py-2.5 font-medium disabled:opacity-40 active:bg-neutral-200"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function ChartsList({
  slug,
  sectionHref,
  charts,
  onChartsChange,
}: {
  slug: string
  sectionHref: string
  charts: ChartEntry[]
  onChartsChange: (next: ChartEntry[]) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function downloadChart(id: string) {
    setError(null)
    const res = await fetch(`/api/vizmaya/stories/${slug}/charts/${id}`)
    if (!res.ok) {
      setError(`Failed to fetch ${id}.json (HTTP ${res.status})`)
      return
    }
    const body = await res.json()
    const text = JSON.stringify(body.data, null, 2) + '\n'
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${id}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function deleteChart(id: string) {
    if (!confirm(`Delete ${id}.json? This cannot be undone, and any story config that references "${id}" will break until updated.`)) return
    setError(null)
    const res = await fetch(`/api/vizmaya/stories/${slug}/charts/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error ?? `Delete failed (HTTP ${res.status})`)
      return
    }
    onChartsChange(charts.filter((c) => c.id !== id))
  }

  async function uploadChart(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    // Filename (sans .json) becomes the chart id; the API restricts ids to
    // [a-zA-Z0-9_-], so reject anything else early with a clear message.
    const id = file.name.replace(/\.json$/i, '')
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      setError(`Bad filename "${file.name}" — chart id must match [a-zA-Z0-9_-].`)
      return
    }
    const text = await file.text()
    try {
      JSON.parse(text)
    } catch (err) {
      setError(`JSON parse: ${err instanceof Error ? err.message : 'invalid'}`)
      return
    }
    setUploading(true)
    const res = await fetch(`/api/vizmaya/stories/${slug}/charts/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw: text }),
    })
    setUploading(false)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error ?? `HTTP ${res.status}`)
      return
    }
    if (!charts.some((c) => c.id === id)) {
      onChartsChange(
        [...charts, { id, editable: true }].sort((a, b) =>
          a.id.localeCompare(b.id)
        )
      )
    }
    router.push(`${sectionHref}/${slug}/charts/${id}`)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/5 bg-neutral-900/40 shrink-0">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="text-xs px-2 py-1 rounded text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-40"
        >
          {uploading ? 'Uploading…' : '↑ Upload chart'}
        </button>
        <span className="text-xs text-neutral-600">filename → id</span>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          onChange={uploadChart}
          className="hidden"
        />
      </div>
      {error && (
        <div className="px-4 py-2 text-xs text-red-400 border-b border-white/5 shrink-0">
          {error}
        </div>
      )}
      {charts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-neutral-500 text-sm">
          No charts for this story.
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {charts.map((c) =>
            c.editable ? (
              <li key={c.id} className="flex items-center">
                <Link
                  href={`${sectionHref}/${slug}/charts/${c.id}`}
                  className="flex-1 flex items-center justify-between px-4 py-4 active:bg-white/5 min-w-0"
                >
                  <span className="font-mono text-sm truncate">{c.id}.json</span>
                  <span className="text-neutral-500 shrink-0 ml-2">›</span>
                </Link>
                <button
                  type="button"
                  onClick={() => downloadChart(c.id)}
                  className="px-3 py-4 text-sm text-neutral-400 hover:text-white hover:bg-white/5 shrink-0"
                  title={`Download ${c.id}.json`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => deleteChart(c.id)}
                  className="px-3 py-4 text-sm text-neutral-400 hover:text-red-400 hover:bg-white/5 shrink-0"
                  title={`Delete ${c.id}.json`}
                >
                  ✕
                </button>
              </li>
            ) : (
              <li
                key={c.id}
                className="flex items-center justify-between px-4 py-4 text-neutral-500"
                title="Hardcoded React component — not editable as JSON"
              >
                <span className="font-mono text-sm truncate">{c.id}</span>
                <span className="text-[10px] uppercase tracking-wider border border-white/10 rounded px-1.5 py-0.5 shrink-0">
                  code
                </span>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  )
}

function StatusBadge({
  status,
  dirty,
}: {
  status: { type: 'idle' | 'ok' | 'err' | 'warn'; msg?: string }
  dirty: boolean
}) {
  if (status.type === 'err') {
    return <span className="text-sm text-red-400 truncate">{status.msg}</span>
  }
  if (status.type === 'warn') {
    return <span className="text-sm text-amber-400 truncate">{status.msg}</span>
  }
  if (status.type === 'ok') {
    return <span className="text-sm text-emerald-400">{status.msg}</span>
  }
  return (
    <span className="text-sm text-neutral-500">
      {dirty ? 'Unsaved changes' : 'No changes'}
    </span>
  )
}

function SettingsPanel({
  status,
  listed,
  displayOrder,
  onChange,
}: {
  status: string
  listed: boolean
  displayOrder: number | null
  onChange: (meta: Partial<{ status: string; listed: boolean; displayOrder: number | null }>) => void
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 overflow-y-auto">
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Publishing Status</label>
          <select
            value={status}
            onChange={(e) => onChange({ status: e.target.value })}
            className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="listed"
            checked={listed}
            onChange={(e) => onChange({ listed: e.target.checked })}
            className="w-4 h-4 rounded"
          />
          <label htmlFor="listed" className="text-sm font-medium">
            Show on home page
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Display order on home page</label>
          <input
            type="number"
            value={displayOrder ? String(displayOrder) : ''}
            onChange={(e) => {
              const val = e.target.value === '' ? null : parseInt(e.target.value, 10)
              onChange({ displayOrder: val })
            }}
            placeholder="Leave empty for unordered"
            className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
          <p className="text-xs text-neutral-500 mt-1">Lower numbers appear first (0-indexed). Leave empty to not display.</p>
        </div>
      </div>
    </div>
  )
}

function BulkResultBanner({
  result,
  onDismiss,
}: {
  result: BulkResult
  onDismiss: () => void
}) {
  const hasError = result.errors.length > 0
  const hasWork = result.applied.length > 0 || result.charts.length > 0
  return (
    <div
      className={`px-4 py-2 text-xs border-b border-white/5 shrink-0 ${
        hasError ? 'bg-red-950/20 text-red-300' : 'bg-emerald-950/20 text-emerald-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          {result.applied.length > 0 && (
            <div>
              <span className="text-neutral-400">Buffer updated (Save to persist):</span>{' '}
              {result.applied.join(', ')}
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
          {!hasError && !hasWork && (
            <div className="text-neutral-400">No matching files in selection.</div>
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
