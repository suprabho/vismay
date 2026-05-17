'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import FileActions from './FileActions'

export default function ChartEditorClient({
  slug,
  chartId,
  initial,
}: {
  slug: string
  chartId: string
  initial: string
}) {
  const [value, setValue] = useState(initial)
  const [baseline, setBaseline] = useState(initial)
  const [saving, start] = useTransition()
  const [status, setStatus] = useState<{ type: 'idle' | 'ok' | 'err'; msg?: string }>({ type: 'idle' })

  const dirty = value !== baseline

  let parseError: string | null = null
  if (dirty) {
    try {
      JSON.parse(value)
    } catch (e) {
      parseError = e instanceof Error ? e.message : 'invalid JSON'
    }
  }

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty && !parseError && !saving) save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, parseError, saving, value])

  function save() {
    start(async () => {
      setStatus({ type: 'idle' })
      const res = await fetch(`/api/admin/stories/${slug}/charts/${chartId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ raw: value }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setStatus({ type: 'err', msg: body?.error ?? `HTTP ${res.status}` })
        return
      }
      setBaseline(value)
      setStatus({ type: 'ok', msg: 'Saved' })
    })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
        <Link href={`/admin/${slug}`} className="text-neutral-400 hover:text-white text-sm">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-neutral-500 truncate">
            {slug} / charts / {chartId}.json
          </div>
        </div>
      </div>

      <FileActions
        filename={`${chartId}.json`}
        accept=".json,application/json"
        mime="application/json;charset=utf-8"
        value={value}
        onUpload={setValue}
      />

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className="flex-1 min-h-0 w-full bg-neutral-950 text-neutral-100 font-mono text-[13px] leading-relaxed p-4 resize-none outline-none focus:bg-neutral-900/40"
      />

      <div className="sticky bottom-0 border-t border-white/10 bg-neutral-950/95 backdrop-blur flex items-center gap-3 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="text-sm truncate flex-1">
          {status.type === 'err' && <span className="text-red-400">{status.msg}</span>}
          {status.type === 'ok' && <span className="text-emerald-400">{status.msg}</span>}
          {status.type === 'idle' && parseError && (
            <span className="text-amber-400">JSON: {parseError}</span>
          )}
          {status.type === 'idle' && !parseError && (
            <span className="text-neutral-500">{dirty ? 'Unsaved changes' : 'No changes'}</span>
          )}
        </div>
        <button
          type="button"
          disabled={!dirty || !!parseError || saving}
          onClick={save}
          className="bg-white text-neutral-950 rounded-lg px-5 py-2.5 font-medium disabled:opacity-40 active:bg-neutral-200"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
