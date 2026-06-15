import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { createServerSupabase } from '@/lib/supabaseServer'
import { RecapMarkdown } from '@/components/section/RecapMarkdown'
import { CopyMarkdownButton } from '@/components/section/CopyMarkdownButton'
import { TriggerRecapButton } from '@/components/footshorts/TriggerRecapButton'

export const dynamic = 'force-dynamic'

type RecapMeta = {
  recap_date: string
  scope: string
  model: string | null
  fixture_count: number
  article_count: number
  generated_at: string
}

type Recap = RecapMeta & { markdown: string }

function scopeLabel(scope: string): string {
  if (scope === 'all') return 'All competitions'
  return scope
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

interface Props {
  params: Promise<{ appSlug: string }>
  searchParams: Promise<{ date?: string; scope?: string }>
}

export default async function AppRecapsPage({ params, searchParams }: Props) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/recaps`)
  const { date, scope } = await searchParams

  const supabase = await createServerSupabase()

  const { data: listData, error: listError } = await supabase
    .from('daily_recaps')
    .select('recap_date, scope, model, fixture_count, article_count, generated_at')
    .order('recap_date', { ascending: false })
    .order('scope', { ascending: true })

  const list = (listData ?? []) as RecapMeta[]

  // Default to the newest recap when none is selected via the query string.
  const selDate = date ?? list[0]?.recap_date ?? null
  const selScope = scope ?? list[0]?.scope ?? null

  let recap: Recap | null = null
  if (selDate && selScope) {
    const { data } = await supabase
      .from('daily_recaps')
      .select('recap_date, scope, model, fixture_count, article_count, generated_at, markdown')
      .eq('recap_date', selDate)
      .eq('scope', selScope)
      .maybeSingle()
    recap = (data ?? null) as Recap | null
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-5 border-b border-white/5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Recaps</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Daily match-day briefs · {list.length} total
          </p>
        </div>
        <TriggerRecapButton />
      </div>

      {listError ? (
        <div className="px-4 py-10 text-sm text-amber-400 text-center">
          Could not load recaps: {listError.message}
        </div>
      ) : list.length === 0 ? (
        <div className="px-4 py-10 text-sm text-neutral-500 text-center">
          No recaps yet. Generate one with{' '}
          <code className="font-mono text-neutral-400">pnpm recap</code> in the footshorts
          worker — it runs automatically after the day&apos;s last game via the scores workflow.
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[260px_1fr]">
          {/* List */}
          <div className="min-h-0 overflow-y-auto border-r border-white/5 p-3 space-y-2">
            {list.map((r) => {
              const active = r.recap_date === selDate && r.scope === selScope
              return (
                <Link
                  key={`${r.recap_date}::${r.scope}`}
                  href={`/${appSlug}/recaps?date=${r.recap_date}&scope=${r.scope}`}
                  className={`block rounded-lg border px-3 py-2.5 transition-colors ${
                    active
                      ? 'border-sky-500/60 bg-white/[0.04]'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{r.recap_date}</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                      {scopeLabel(r.scope)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {r.fixture_count} match{r.fixture_count === 1 ? '' : 'es'} ·{' '}
                    {r.article_count} stor{r.article_count === 1 ? 'y' : 'ies'}
                    {r.model ? '' : ' · no narrative'}
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Detail */}
          <div className="min-h-0 overflow-y-auto p-5">
            {recap ? (
              <article className="mx-auto max-w-3xl">
                <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <span className="text-xs text-neutral-500">
                    {recap.model ? `Narrative: ${recap.model}` : 'Deterministic only'} · generated{' '}
                    {new Date(recap.generated_at).toLocaleString()}
                  </span>
                  <CopyMarkdownButton markdown={recap.markdown} />
                </div>
                <RecapMarkdown markdown={recap.markdown} />
              </article>
            ) : (
              <p className="text-sm text-neutral-500">Select a recap.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
