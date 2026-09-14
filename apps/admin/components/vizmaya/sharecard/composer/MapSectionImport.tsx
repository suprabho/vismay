'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ResolvedUnit } from '@vismay/viz-engine'
import type { MapData } from '../layers/types'
import { mapDataFromUnit, mapDataSummary, unitHasMap, unitLabel } from '../layers/mapFromSection'
import { labelCls, selectCls } from './controls'

/** Story units + story list the map importer can pull sections from. */
export interface MapImportSources {
  /** Slug of the story attached to the card ('' on a blank canvas). */
  currentSlug: string
  /** Resolved units of the attached story (already loaded by the composer). */
  units: ResolvedUnit[]
  /** Every story the composer can attach — other stories are fetched on demand. */
  stories: Array<{ slug: string; title: string }>
}

const unitsCache = new Map<string, ResolvedUnit[]>()

async function fetchStoryUnits(slug: string): Promise<ResolvedUnit[]> {
  const cached = unitsCache.get(slug)
  if (cached) return cached
  const res = await fetch(`/api/vizmaya/share-cards/stories/${encodeURIComponent(slug)}`)
  const body = (await res.json().catch(() => null)) as { ok?: boolean; units?: ResolvedUnit[]; error?: string } | null
  if (!res.ok || !body?.ok || !Array.isArray(body.units)) {
    throw new Error(body?.error || `failed to load ${slug}`)
  }
  unitsCache.set(slug, body.units)
  return body.units
}

/** Units fetched for a non-attached story (or the failure to do so). */
type RemoteUnits = { slug: string; units: ResolvedUnit[]; error: null } | { slug: string; units: []; error: string }

const keyOf = (u: ResolvedUnit) => `${u.parentIndex}-${u.subIndex}`

/**
 * "Import from story section" — copies a section's map block (camera + pins /
 * regions / heatmap / labels) into the selected map layer's authored `data`,
 * so a card can carry any section's map (from this story or another) without
 * re-typing it as YAML. The result is a plain per-card override: it snapshots
 * the section at import time and does NOT track later story edits.
 */
export function MapSectionImport({
  sources,
  onImport,
}: {
  sources: MapImportSources
  onImport: (data: MapData, from: { slug: string; unit: ResolvedUnit }) => void
}) {
  const { currentSlug, units: currentUnits, stories } = sources
  const storyChoices = useMemo(() => {
    const list = stories.slice()
    if (currentSlug && !list.some((s) => s.slug === currentSlug)) list.unshift({ slug: currentSlug, title: currentSlug })
    return list
  }, [stories, currentSlug])

  // `null` = follow the attached story (so re-attaching a story re-targets the
  // picker without an effect); a string = the user picked another story.
  const [storyChoice, setStoryChoice] = useState<string | null>(null)
  const storySlug = storyChoice ?? (currentSlug || storyChoices[0]?.slug || '')
  const isCurrent = storySlug !== '' && storySlug === currentSlug

  // Units for a non-attached story, fetched once per pick and cached for the
  // session. State is keyed by slug so a stale result for a previous pick is
  // ignored rather than cleared synchronously.
  const [remote, setRemote] = useState<RemoteUnits | null>(null)
  useEffect(() => {
    if (!storySlug || isCurrent) return
    let cancelled = false
    fetchStoryUnits(storySlug)
      .then((units) => {
        if (!cancelled) setRemote({ slug: storySlug, units, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) setRemote({ slug: storySlug, units: [], error: e instanceof Error ? e.message : 'failed to load story' })
      })
    return () => {
      cancelled = true
    }
  }, [storySlug, isCurrent])

  const remoteForSlug = !isCurrent && remote?.slug === storySlug ? remote : null
  const loading = !!storySlug && !isCurrent && !remoteForSlug
  const error = remoteForSlug?.error ?? null

  const mapUnits = useMemo(() => {
    const units = isCurrent ? currentUnits : (remoteForSlug?.units ?? [])
    return units.filter(unitHasMap)
  }, [isCurrent, currentUnits, remoteForSlug])

  // Section choice, derived: fall back to the first map section whenever the
  // stored key isn't in the current list (story switched, units reloaded).
  const [unitChoice, setUnitChoice] = useState<string>('')
  const unitKey = mapUnits.some((u) => keyOf(u) === unitChoice) ? unitChoice : mapUnits[0] ? keyOf(mapUnits[0]) : ''
  const selectedUnit = mapUnits.find((u) => keyOf(u) === unitKey)
  const preview = useMemo(() => (selectedUnit ? mapDataFromUnit(selectedUnit) : null), [selectedUnit])

  if (storyChoices.length === 0) return null

  return (
    <div className="space-y-2 rounded-md border border-white/10 bg-neutral-950/40 px-2.5 py-2">
      <div className="text-[11px] text-neutral-400">Import from story section</div>
      <label className={labelCls}>
        Story
        <select value={storySlug} onChange={(e) => setStoryChoice(e.target.value)} className={selectCls}>
          {storyChoices.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.title || s.slug}
              {s.slug === currentSlug ? ' · attached' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        Section
        <select
          value={unitKey}
          onChange={(e) => setUnitChoice(e.target.value)}
          disabled={loading || mapUnits.length === 0}
          className={selectCls}
        >
          {mapUnits.length === 0 && <option value="">{loading ? 'Loading…' : 'No map sections'}</option>}
          {mapUnits.map((u) => (
            <option key={keyOf(u)} value={keyOf(u)}>
              {unitLabel(u)}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
      {preview && (
        <p className="text-[10px] text-neutral-500">
          {mapDataSummary(preview)} · zoom {preview.zoom ?? '—'}
        </p>
      )}
      <button
        type="button"
        disabled={!preview || !selectedUnit}
        onClick={() => {
          if (preview && selectedUnit) onImport(preview, { slug: storySlug, unit: selectedUnit })
        }}
        className="w-full rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-white/10 disabled:opacity-40"
      >
        Import map data
      </button>
      <p className="text-[10px] text-neutral-600">
        Copies the section&apos;s camera, pins, regions, heatmap and labels into this layer&apos;s map data and resets
        the card camera to match. Edit the result via the YAML editor.
      </p>
    </div>
  )
}
