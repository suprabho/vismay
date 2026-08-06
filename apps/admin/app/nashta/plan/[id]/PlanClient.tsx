'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type {
  MealPlan,
  MealPlanCombo,
  MealPlanShoppingItem,
  NashtaRecipeDetail,
} from '@vismay/content-source/epics'
import { CATEGORY_LABELS, CATEGORY_ORDER, instructionSteps } from '@/lib/nashta/renderPlanHtml'

const ROLE_LABELS: Record<string, string> = {
  main: 'Main',
  side: 'Side',
  condiment: 'Condiment',
  drink: 'Drink',
  dessert: 'Dessert',
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
}

function shortTitle(title: string): string {
  return title.replace(/ Recipe.*$/i, '')
}

export default function PlanClient({
  plan,
  recipes,
}: {
  plan: MealPlan
  recipes: NashtaRecipeDetail[]
}) {
  const router = useRouter()
  const [selecting, setSelecting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const finalized = plan.status === 'finalized' && plan.selectedIndex != null
  const combo = finalized ? plan.suggestions[plan.selectedIndex!] : null

  async function choose(idx: number) {
    if (selecting != null) return
    setSelecting(idx)
    setError(null)
    try {
      const res = await fetch(`/api/nashta/plans/${plan.id}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comboIndex: idx }),
      })
      const json = (await res.json()) as { plan?: MealPlan; error?: string }
      if (!res.ok || !json.plan) throw new Error(json.error ?? `select failed (${res.status})`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'select failed')
      setSelecting(null)
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/nashta" className="text-sm text-neutral-400 hover:text-white transition-colors">
            ← Nashta
          </Link>
          {finalized && (
            <div className="flex items-center gap-3 text-sm">
              <a
                href={`/api/nashta/plans/${plan.id}/html`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-neutral-300 hover:text-white hover:border-white/30 transition-colors"
              >
                Print view
              </a>
              <a
                href={`/api/nashta/plans/${plan.id}/html?download=1`}
                className="rounded-lg bg-orange-500 px-3 py-1.5 font-semibold text-neutral-950 hover:bg-orange-400 transition-colors"
              >
                Download HTML
              </a>
            </div>
          )}
        </div>

        <header>
          <div className="text-xs uppercase tracking-[0.14em] text-orange-400 font-semibold">
            {plan.meal} · {formatDate(plan.planDate)}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            {combo ? combo.title : `Pick tomorrow’s ${plan.meal}`}
          </h1>
          <p className="text-neutral-400 text-sm mt-2">
            {combo ? combo.rationale : `“${plan.instructions}”`}
          </p>
        </header>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {!finalized ? (
          <ComboPicker
            combos={plan.suggestions}
            selecting={selecting}
            onChoose={choose}
          />
        ) : (
          <FinalizedPlan plan={plan} combo={combo!} recipes={recipes} />
        )}
      </div>
    </div>
  )
}

function ComboPicker({
  combos,
  selecting,
  onChoose,
}: {
  combos: MealPlanCombo[]
  selecting: number | null
  onChoose: (idx: number) => void
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {combos.map((c, idx) => (
        <div
          key={idx}
          className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-5 gap-3"
        >
          <div>
            <h2 className="font-semibold leading-snug">{c.title}</h2>
            <p className="text-sm text-neutral-400 mt-1">{c.rationale}</p>
          </div>
          <ul className="space-y-1.5 text-sm flex-1">
            {c.items.map((i) => (
              <li key={i.recipeId} className="flex gap-2">
                <span className="shrink-0 w-20 text-[10px] uppercase tracking-wider text-orange-400/90 font-semibold pt-1">
                  {ROLE_LABELS[i.role] ?? i.role}
                </span>
                <span>{shortTitle(i.title)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="rounded-full bg-white/10 px-2.5 py-1">~{c.estTotalMin} min</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">{c.effort}</span>
          </div>
          {c.overnightPrep && (
            <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Ahead: {c.overnightPrep}
            </p>
          )}
          <button
            onClick={() => onChoose(idx)}
            disabled={selecting != null}
            className="mt-1 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-orange-400 transition-colors disabled:opacity-50"
          >
            {selecting === idx ? 'Shopping list + videos…' : 'Cook this'}
          </button>
        </div>
      ))}
    </div>
  )
}

function FinalizedPlan({
  plan,
  combo,
  recipes,
}: {
  plan: MealPlan
  combo: MealPlanCombo
  recipes: NashtaRecipeDetail[]
}) {
  const prepAhead = [
    ...(combo.overnightPrep ? [combo.overnightPrep] : []),
    ...(plan.shopping?.prepAhead ?? []),
  ]
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <ul className="space-y-2">
          {combo.items.map((i) => (
            <li key={i.recipeId} className="flex gap-3 items-baseline">
              <span className="shrink-0 w-24 text-[10px] uppercase tracking-wider text-orange-400 font-semibold">
                {ROLE_LABELS[i.role] ?? i.role}
              </span>
              <span className="font-medium">{shortTitle(i.title)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 text-xs text-neutral-400 mt-4">
          <span className="rounded-full bg-white/10 px-2.5 py-1">~{combo.estTotalMin} min</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">{combo.effort}</span>
        </div>
      </section>

      {prepAhead.length > 0 && (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5">
          <h2 className="text-sm font-semibold text-amber-300 mb-2">
            {plan.meal === 'breakfast' ? '🌙 Tonight, before bed' : '⏳ Prep ahead'}
          </h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-amber-100/90">
            {prepAhead.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      <ShoppingList items={plan.shopping?.items ?? []} />
      <Videos plan={plan} />
      <Recipes recipes={recipes} />
    </div>
  )
}

function ShoppingList({ items }: { items: MealPlanShoppingItem[] }) {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  if (items.length === 0) return null
  const toBuy = items.filter((i) => !i.staple)
  const staples = items.filter((i) => i.staple)

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const renderGroup = (list: MealPlanShoppingItem[]) =>
    CATEGORY_ORDER.filter((c) => list.some((i) => i.category === c)).map((c) => (
      <div key={c}>
        <h3 className="text-xs uppercase tracking-wider text-neutral-500 mt-4 mb-2">
          {CATEGORY_LABELS[c] ?? c}
        </h3>
        <ul className="space-y-1.5">
          {list
            .filter((i) => i.category === c)
            .map((i) => {
              const key = `${c}:${i.name}`
              const done = checked.has(key)
              return (
                <li key={key}>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggle(key)}
                      className="mt-1 accent-orange-500"
                    />
                    <span className={done ? 'line-through text-neutral-500' : ''}>
                      <span className="font-medium">{i.name}</span>
                      <span className="text-neutral-400"> — {i.quantity}</span>
                      {i.forDishes.length > 0 && (
                        <span className="text-neutral-500 text-xs"> ({i.forDishes.join(', ')})</span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
        </ul>
      </div>
    ))

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">🛒 Shopping list</h2>
      {toBuy.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 pt-1 text-sm">
          {renderGroup(toBuy)}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Nothing to buy — it&apos;s all in the pantry.</p>
      )}
      {staples.length > 0 && (
        <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 pt-4 text-sm text-neutral-300">
          <summary className="cursor-pointer text-neutral-400">
            Pantry check — {staples.length} staples you likely have
          </summary>
          {renderGroup(staples)}
        </details>
      )}
    </section>
  )
}

function Videos({ plan }: { plan: MealPlan }) {
  if (!plan.videos || plan.videos.length === 0) return null
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">📺 Recipe videos (Hindi)</h2>
      <div className="space-y-5">
        {plan.videos.map((d) => (
          <div key={d.recipeId}>
            <h3 className="text-sm font-medium text-neutral-300 mb-2">
              {shortTitle(d.dishTitle)}{' '}
              <span className="text-neutral-500 font-normal">· {d.query}</span>
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {d.videos.map((v, i) => (
                <a
                  key={i}
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-52 shrink-0 rounded-xl border border-white/10 bg-white/5 overflow-hidden hover:border-white/25 transition-colors"
                >
                  {v.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="aspect-video w-full flex items-center justify-center bg-white/5 text-orange-400 text-2xl">
                      ▶
                    </div>
                  )}
                  <span className="block px-3 pt-2 text-xs font-medium leading-snug line-clamp-2">
                    {v.title}
                  </span>
                  <span className="block px-3 pb-2.5 pt-1 text-[11px] text-neutral-500">
                    {[v.channel, v.duration].filter(Boolean).join(' · ')}
                  </span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Recipes({ recipes }: { recipes: NashtaRecipeDetail[] }) {
  if (recipes.length === 0) return null
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">🍳 Recipes</h2>
      <div className="space-y-3">
        {recipes.map((r) => {
          const steps = instructionSteps(r.instructions ?? '')
          const ings = (r.ingredientsRaw ?? '')
            .split(/,(?![^(]*\))/)
            .map((s) => s.trim())
            .filter(Boolean)
          return (
            <details key={r.id} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
              <summary className="cursor-pointer">
                <span className="font-medium">{shortTitle(r.title)}</span>
                <span className="text-neutral-500 text-sm ml-2">
                  {[
                    r.titleNative,
                    r.prepMin != null ? `prep ${r.prepMin}m` : null,
                    r.cookMin != null ? `cook ${r.cookMin}m` : null,
                    r.servings != null ? `serves ${r.servings}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </summary>
              <div className="mt-3 grid gap-5 md:grid-cols-[240px_1fr] text-sm">
                {ings.length > 0 && (
                  <ul className="space-y-1 text-neutral-300">
                    {ings.map((s, i) => (
                      <li key={i} className="border-l-2 border-orange-500/40 pl-2.5">
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
                <div>
                  {steps.length > 1 ? (
                    <ol className="list-decimal pl-5 space-y-2 text-neutral-200">
                      {steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-neutral-200 leading-relaxed">{r.instructions}</p>
                  )}
                  {r.url && (
                    <p className="mt-3 text-xs text-neutral-500">
                      Source:{' '}
                      <a href={r.url} target="_blank" rel="noreferrer" className="underline hover:text-neutral-300">
                        {r.url}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}
