'use client'

/**
 * AI models — assign which model each AI feature uses. Reads/writes the
 * per-feature mapping (ai_model_settings) via /api/vizmaya/ai-models.
 */

import { useEffect, useState } from 'react'
import { AdminTable } from '@/components/admin'

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
        <div className="mt-6 rounded-lg border border-white/10">
          <AdminTable
            rows={data.features}
            rowKey={(feature) => feature.key}
            empty="No AI features configured."
            caption="AI feature model assignments"
            columns={[
              {
                key: 'feature',
                label: 'Feature',
                render: (feature) => (
                  <div className="min-w-56">
                    <div className="text-sm text-neutral-100">{feature.label}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">{feature.description}</div>
                  </div>
                ),
              },
              {
                key: 'modality',
                label: 'Modality',
                responsive: 'secondary',
                render: (feature) => (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-500">
                    {feature.modality}
                  </span>
                ),
              },
              {
                key: 'model',
                label: 'Model',
                render: (feature) => {
                  const aliases = data.aliases[feature.modality]
                  const current = data.map[feature.key] ?? feature.default
                  return (
                    <select
                      value={current}
                      disabled={savingKey === feature.key}
                      onChange={(event) => void setModel(feature.key, event.target.value)}
                      className="w-full min-w-52 rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-[12px] text-neutral-200 focus:border-white/30 focus:outline-none disabled:opacity-40"
                      title={aliases.find((alias) => alias.alias === current)?.id}
                    >
                      {aliases.map((alias) => (
                        <option key={alias.alias} value={alias.alias}>
                          {alias.alias.replace(/^(text|image)\./, '')} — {alias.id}
                        </option>
                      ))}
                    </select>
                  )
                },
              },
            ]}
          />
        </div>
      )}
    </div>
  )
}
