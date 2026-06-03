'use client'

/**
 * AI models — assign which model each AI feature uses. Reads/writes the
 * per-feature mapping (ai_model_settings) via /api/vizmaya/ai-models.
 */

import { useEffect, useState } from 'react'

interface Feature {
  key: string
  label: string
  modality: 'text' | 'image'
  default: string
  description: string
}
interface Alias {
  alias: string
  id: string
}
interface Data {
  features: Feature[]
  map: Record<string, string>
  aliases: { text: Alias[]; image: Alias[] }
}

export default function AiModelsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/vizmaya/ai-models')
        const body = (await res.json().catch(() => ({}))) as Data & {
          error?: string
        }
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        setData(body)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load.')
      }
    })()
  }, [])

  async function setModel(feature: string, model: string) {
    if (!data) return
    const prev = data.map[feature]
    setData({ ...data, map: { ...data.map, [feature]: model } }) // optimistic
    setSavingKey(feature)
    setError(null)
    try {
      const res = await fetch('/api/vizmaya/ai-models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, model }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
      setData((d) => (d ? { ...d, map: { ...d.map, [feature]: prev } } : d)) // revert
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-lg font-medium">AI models</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Choose which model each AI feature uses. Saved instantly. Features with a
        live picker (Ask, selection edit) use this as the default.
      </p>

      {error && (
        <div className="mt-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {!data ? (
        <div className="mt-6 text-sm text-neutral-500">Loading…</div>
      ) : (
        <div className="mt-6 divide-y divide-white/5 rounded-lg border border-white/10">
          {data.features.map((f) => {
            const aliases = data.aliases[f.modality]
            const current = data.map[f.key] ?? f.default
            return (
              <div
                key={f.key}
                className="flex items-center gap-4 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm text-neutral-100">
                    {f.label}
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-500">
                      {f.modality}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {f.description}
                  </div>
                </div>
                <select
                  value={current}
                  disabled={savingKey === f.key}
                  onChange={(e) => void setModel(f.key, e.target.value)}
                  className="shrink-0 rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-[12px] text-neutral-200 focus:border-white/30 focus:outline-none disabled:opacity-40"
                  title={aliases.find((a) => a.alias === current)?.id}
                >
                  {aliases.map((a) => (
                    <option key={a.alias} value={a.alias}>
                      {a.alias.replace(/^(text|image)\./, '')} — {a.id}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
