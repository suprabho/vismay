'use client'

import { useEffect, useRef, useState } from 'react'
import type { AdminFoodRecipe, FoodRecipeCoverage } from '@vismay/content-source/epics'

/**
 * Umami "Recipes" tab — coverage of the ingested recipe corpora (migration
 * 070) plus a browse/search over them. Read-only monitoring in the Pipeline
 * tab idiom: stat cards, plain-div bars, one fetch per concern.
 */

const SOURCE_LABELS: Record<string, string> = {
  'archanas-kitchen': "Archana's Kitchen",
  culinarydb: 'CulinaryDB',
}
const CUISINE_LABELS: Record<string, string> = {
  india: 'India',
  china: 'China',
  thailand: 'Thailand',
  indonesia: 'Indonesia',
  japan: 'Japan',
}

const fmt = (n: number): string => n.toLocaleString('en-US')

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-[130px] flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-neutral-500">{hint}</div>}
    </div>
  )
}

function CuisineRow({ c, max }: { c: FoodRecipeCoverage['cuisines'][number]; max: number }) {
  const ak = c.recipesBySource['archanas-kitchen'] ?? 0
  const cdb = c.recipesBySource['culinarydb'] ?? 0
  const width = (n: number) => `${Math.max(n > 0 ? 1.5 : 0, (n / max) * 100)}%`
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-white">{CUISINE_LABELS[c.cuisine] ?? c.cuisine}</span>
        <span className="text-xs text-neutral-500">
          {fmt(c.recipesTotal)} recipes · {c.dishes} dishes ({c.dishesWithIngredients} with ingredients)
        </span>
      </div>
      <div className="flex h-2 w-full gap-px overflow-hidden rounded-sm bg-white/[0.04]">
        <div className="bg-amber-400/80" style={{ width: width(ak) }} title={`Archana's Kitchen: ${fmt(ak)}`} />
        <div className="bg-sky-400/80" style={{ width: width(cdb) }} title={`CulinaryDB: ${fmt(cdb)}`} />
      </div>
    </div>
  )
}

function RecipeRow({ r }: { r: AdminFoodRecipe }) {
  const meta = [
    SOURCE_LABELS[r.source] ?? r.source,
    r.cuisineRaw ?? (r.cuisine ? CUISINE_LABELS[r.cuisine] : null),
    r.course,
    r.diet,
    r.totalMin != null ? `${r.totalMin} min` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="border-b border-white/5 py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-white">
          {r.url ? (
            <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">
              {r.title} <span className="text-neutral-600">↗</span>
            </a>
          ) : (
            r.title
          )}
        </span>
        <span className="shrink-0 text-[11px] text-neutral-500">
          {r.ingredients.length > 0 && `${r.ingredients.length} ingredients`}
          {r.hasInstructions && (
            <span className="ml-2 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-neutral-300">
              instructions
            </span>
          )}
        </span>
      </div>
      <div className="mt-0.5 truncate text-xs text-neutral-500">{meta}</div>
      {r.ingredients.length > 0 && (
        <div className="mt-0.5 truncate text-[11px] text-neutral-600">
          {r.ingredients.slice(0, 8).join(', ')}
          {r.ingredients.length > 8 ? ', …' : ''}
        </div>
      )}
    </div>
  )
}

const PAGE = 30

export function RecipesClient() {
  const [coverage, setCoverage] = useState<FoodRecipeCoverage | null>(null)
  const [coverageError, setCoverageError] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [source, setSource] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [rows, setRows] = useState<AdminFoodRecipe[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const fetchSeq = useRef(0)

  useEffect(() => {
    fetch('/api/umami/recipes/coverage')
      .then((r) => r.json())
      .then((d) => (d.coverage ? setCoverage(d.coverage) : setCoverageError(d.error ?? 'failed')))
      .catch((e) => setCoverageError(String(e)))
  }, [])

  useEffect(() => {
    const seq = ++fetchSeq.current
    setLoading(true)
    const t = setTimeout(() => {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (source) params.set('source', source)
      if (cuisine) params.set('cuisine', cuisine)
      params.set('limit', String(PAGE))
      fetch(`/api/umami/recipes?${params}`)
        .then((r) => r.json())
        .then((d) => {
          if (seq !== fetchSeq.current) return
          setRows(d.rows ?? [])
          setTotal(d.total ?? 0)
          setLoading(false)
        })
        .catch(() => seq === fetchSeq.current && setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [q, source, cuisine])

  const loadMore = () => {
    const seq = ++fetchSeq.current
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (source) params.set('source', source)
    if (cuisine) params.set('cuisine', cuisine)
    params.set('offset', String(rows.length))
    params.set('limit', String(PAGE))
    fetch(`/api/umami/recipes?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (seq !== fetchSeq.current) return
        setRows((prev) => [...prev, ...(d.rows ?? [])])
        setTotal(d.total ?? 0)
      })
      .catch(() => {})
  }

  const maxCuisine = coverage ? Math.max(1, ...coverage.cuisines.map((c) => c.recipesTotal)) : 1

  return (
    <div>
      {coverageError && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          Coverage unavailable: {coverageError}
        </div>
      )}

      {coverage && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Stat label="Recipes" value={fmt(coverage.recipesTotal)} hint="food_recipes rows" />
            <Stat
              label="Archana's Kitchen"
              value={fmt(coverage.recipesBySource['archanas-kitchen'] ?? 0)}
              hint={`${fmt(coverage.withInstructions)} with instructions`}
            />
            <Stat label="CulinaryDB" value={fmt(coverage.recipesBySource['culinarydb'] ?? 0)} hint="ingredient sets" />
            <Stat
              label="Ingredient vocabulary"
              value={fmt(coverage.vocabulary.total)}
              hint={`${coverage.vocabulary.compounds} compounds`}
            />
          </div>

          <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-neutral-500">Epic cuisine coverage</span>
              <span className="flex items-center gap-3 text-[10px] text-neutral-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-amber-400/80" /> Archana's Kitchen
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-sky-400/80" /> CulinaryDB
                </span>
              </span>
            </div>
            {coverage.cuisines.map((c) => (
              <CuisineRow key={c.cuisine} c={c} max={maxCuisine} />
            ))}
            <div className="mt-3 text-[11px] text-neutral-500">
              {fmt(coverage.unmappedRecipes)} recipes carry only their dataset's own label (Continental, USA,
              Italy, …) — browse them with the “unmapped” filter.
            </div>
          </div>
        </>
      )}

      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, cuisine label, or an ingredient (e.g. soy sauce)"
            className="min-w-[220px] flex-1 rounded-md border border-white/10 bg-neutral-900 px-3 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-white/25 focus:outline-none"
          />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-300 focus:outline-none"
          >
            <option value="">All sources</option>
            <option value="archanas-kitchen">Archana's Kitchen</option>
            <option value="culinarydb">CulinaryDB</option>
          </select>
          <select
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            className="rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-300 focus:outline-none"
          >
            <option value="">All cuisines</option>
            {Object.entries(CUISINE_LABELS).map(([slug, label]) => (
              <option key={slug} value={slug}>
                {label}
              </option>
            ))}
            <option value="unmapped">Unmapped</option>
          </select>
        </div>

        <div className="mb-2 text-xs text-neutral-500">
          {loading ? 'Searching…' : `${fmt(total)} recipes${rows.length < total ? ` · showing ${fmt(rows.length)}` : ''}`}
        </div>
        <div>
          {rows.map((r) => (
            <RecipeRow key={`${r.source}-${r.id}`} r={r} />
          ))}
          {!loading && rows.length === 0 && (
            <div className="py-6 text-center text-sm text-neutral-600">No recipes match.</div>
          )}
        </div>
        {rows.length < total && (
          <button
            type="button"
            onClick={loadMore}
            className="mt-3 w-full rounded-md border border-white/10 bg-white/[0.03] py-2 text-sm text-neutral-300 hover:bg-white/[0.06]"
          >
            Load more ({fmt(total - rows.length)} remaining)
          </button>
        )}
      </div>
    </div>
  )
}
